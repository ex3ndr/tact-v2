import { AllocationCell, AllocationField, ContractABI, ContractField, ContractFunctionArg } from "../abi/ContractABI";
import { TypeRef } from "../types/types";
import { Writer } from "./Writer";
import * as changeCase from "change-case";

function printFieldType(ref: TypeRef): string {
    if (ref.kind === 'ref') {
        if (ref.name === 'Int') {
            return 'BN' + (ref.optional ? ' | null' : '');
        } else if (ref.name === 'Bool') {
            return 'boolean' + (ref.optional ? ' | null' : '');
        } else if (ref.name === 'Cell') {
            return 'Cell' + (ref.optional ? ' | null' : '');
        } else if (ref.name === 'Slice') {
            return 'Slice' + (ref.optional ? ' | null' : '');
        } else if (ref.name === 'Address') {
            return 'Address' + (ref.optional ? ' | null' : '');
        } else {
            return ref.name + (ref.optional ? ' | null' : '');
        }
    }
    if (ref.kind === 'map') {
        return `Cell`;
    }

    throw Error(`Unsupported type`);
}

function writeArguments(args: ContractFunctionArg[]) {
    return args.map((v) => `${v.name}: ${printFieldType(v.type)}`).join(', ');
}

function writeField(field: ContractField, w: Writer) {
    w.append(`${field.name}: ${printFieldType(field.type)};`);
}

function writeStackItem(name: string, ref: TypeRef, w: Writer) {
    if (ref.kind === 'ref') {

        if (ref.optional) {
            w.append(`if (${name} !== null) {`);
            w.inIndent(() => {
                writeStackItem(name, { ...ref, optional: false }, w);
            });
            w.append('} else {');
            w.inIndent(() => {
                w.append(`__stack.push({ type: 'null' });`);
            });
            w.append('}');
            return;
        }

        if (ref.name === 'Int') {
            w.append(`__stack.push({ type: 'int', value: ${name} });`);
            return;
        } else if (ref.name === 'Cell') {
            w.append(`__stack.push({ type: 'cell', cell: ${name} });`);
            return;
        } else if (ref.name === 'Slice') {
            w.append(`__stack.push({ type: 'slice', cell: ${name}.toCell() });`);
            return;
        } else if (ref.name === 'Address') {
            w.append(`__stack.push({ type: 'slice', cell: beginCell().storeAddress(${name}).endCell() });`);
            return;
        } else if (ref.name === 'Bool') {
            w.append(`__stack.push({ type: 'int', value: ${name} ? new BN(-1) : new BN(0) });`);
            return;
        } else {
            // throw Error(`Unsupported type: ${ref.name}`);
        }
    }

    if (ref.kind === 'map') {
        w.append(`__stack.push({ type: 'cell', cell: ${name}});`);
        return;
    }

    // throw Error(`Unsupported type`);
}

export function writeTypescript(abi: ContractABI, code: string, depends: { [key: string]: { code: string } }) {
    let w = new Writer();
    w.append(`import { Cell, Slice, StackItem, Address, Builder, InternalMessage, CommonMessageInfo, CellMessage, beginCell, serializeDict } from 'ton';`);
    w.append(`import { ContractExecutor, createExecutorFromCode } from 'ton-nodejs';`);
    w.append(`import BN from 'bn.js';`);
    w.append();

    // Structs
    for (let s of abi.structs) {
        w.append(`export type ${s.name} = {`);
        w.inIndent(() => {
            w.append(`$$type: '${s.name}';`);
            for (let f of s.fields) {
                writeField(f, w);
            }
        });
        w.append(`}`);
        w.append();

        w.append(`export function pack${s.name}(src: ${s.name}): Cell {`);
        w.inIndent(() => {
            w.append(`let b_0 = new Builder();`);
            if (s.allocation.prefix) {
                w.append(`b_0 = b_0.storeUint(${s.allocation.prefix}, 32);`);
            }

            function processField(index: number, f: AllocationField) {
                if (f.kind === 'int') {
                    if (f.bits === 1) {
                        w.append(`b_${index} = b_${index}.storeBit(src.${s.fields[f.index].name});`);
                    } else {
                        w.append(`b_${index} = b_${index}.storeInt(src.${s.fields[f.index].name}, ${f.bits});`);
                    }
                } else if (f.kind === 'uint') {
                    w.append(`b_${index} = b_${index}.storeUint(src.${s.fields[f.index].name}, ${f.bits});`);
                } else if (f.kind === 'coins') {
                    w.append(`b_${index} = b_${index}.storeCoins(src.${s.fields[f.index].name});`);
                } else if (f.kind === 'cell') {
                    w.append(`b_${index} = b_${index}.storeRef(src.${s.fields[f.index].name});`);
                } else if (f.kind === 'slice') {
                    w.append(`b_${index} = b_${index}.storeRef(src.${s.fields[f.index].name}.toCell());`);
                } else if (f.kind === 'optional') {
                    w.append(`if (src.${s.fields[f.index].name} !== null) {`);
                    w.inIndent(() => {
                        w.append(`b_${index} = b_${index}.storeBit(true);`);
                        processField(index, f.inner);
                    });
                    w.append(`} else {`);
                    w.inIndent(() => {
                        w.append(`b_${index} = b_${index}.storeBit(false);`);
                    });
                    w.append(`}`);
                } else if (f.kind === 'struct') {
                    w.append(`b_${index} = b_${index}.storeCellCopy(pack${f.type}(src.${s.fields[f.index].name}));`);
                } else if (f.kind === 'address') {
                    w.append(`b_${index} = b_${index}.storeAddress(src.${s.fields[f.index].name});`);
                } else if (f.kind === 'remaining') {
                    w.append(`b_${index} = b_${index}.storeCellCopy(src.${s.fields[f.index].name}.toCell());`);
                } else if (f.kind === 'bytes') {
                    w.append(`b_${index} = b_${index}.storeCellCopy(src.${s.fields[f.index].name}.toCell());`);
                } else {
                    throw Error('Unsupported field type');
                }
            }

            function processCell(index: number, src: AllocationCell) {
                for (let f of src.fields) {
                    processField(index, f);
                }
                if (src.next) {
                    w.append(`let b_${index + 1} = new Builder();`);
                    processCell(index + 1, src.next);
                    w.append(`b_${index} = b_${index}.storeRef(b_${index + 1}.endCell());`);
                }
            }
            processCell(0, s.allocation.root);

            w.append(`return b_0.endCell();`);
        });
        w.append(`}`);
        w.append();

        w.append(`export function packStack${s.name}(src: ${s.name}, to: StackItem[]) {`);
        w.inIndent(() => {
            for (const f of s.fields) {
                if (f.type.kind === 'map') {
                    w.append(`to.push({ type: 'cell', cell: src.${f.name} });`);
                } else if (f.type.kind === 'null') {
                    w.append(`to.push({ type: 'null' });`);
                } else if (f.type.kind === 'void') {
                    throw Error('Impossible');
                } else if (f.type.kind === 'ref') {
                    function writeType(name: string, type: string) {
                        if (type === 'Cell') {
                            w.append(`to.push({ type: 'cell', cell: src.${name} });`);
                        } else if (type === 'Builder') {
                            w.append(`to.push({ type: 'builder', cell: src.${name} });`);
                        } else if (type === 'Slice') {
                            w.append(`to.push({ type: 'slice', cell: src.${name}.toCell() });`);
                        } else if (type === 'Int') {
                            w.append(`to.push({ type: 'int', value: src.${name} });`);
                        } else if (type === 'Bool') {
                            w.append(`to.push({ type: 'int', value: src.${name} ? new BN(-1): new BN(0) });`);
                        } else if (type === 'Address') {
                            w.append(`to.push({ type: 'slice', cell: beginCell().storeAddress(src.${name}).endCell() });`);
                        } else {
                            w.append(`packStack${type}(src.${name}, to);`);
                        }
                    }
                    let name = f.type.name;
                    if (f.type.optional) {
                        w.append(`if (src.${f.name} === null) {`);
                        w.inIndent(() => {
                            w.append(`to.push({ type: 'null' });`);
                        });
                        w.append(`} else {`);
                        w.inIndent(() => {
                            writeType(f.name, name);
                        });
                        w.append(`}`);
                    } else {
                        writeType(f.name, name);
                    }
                }
            }
        });
        w.append(`}`);
        w.append();
    }

    // Init
    if (abi.init) {
        w.append(`export async function ${abi.name}_init(${writeArguments(abi.init.args)}) {`);
        w.inIndent(() => {

            // Code references
            w.append(`const __code = '${code}';`);
            w.append(`const depends = new Map<string, Cell>();`);
            for (let s in abi.dependsOn) {
                let cd = depends[s];
                if (!cd) {
                    throw Error(`Cannot find code for ${s}`);
                }
                w.append(`depends.set('${abi.dependsOn[s].uid}', Cell.fromBoc(Buffer.from('${cd.code}', 'base64'))[0]);`);
            }
            if (Object.values(abi.dependsOn).length > 0) {
                w.append(`let systemCell = beginCell().storeDict(serializeDict(depends, 16, (src, v) => v.refs.push(src))).endCell();`);
            } else {
                w.append(`let systemCell = beginCell().storeDict(null).endCell();`);
            }

            // Stack
            w.append('let __stack: StackItem[] = [];');
            w.append(`__stack.push({ type: 'cell', cell: systemCell });`);
            for (let a of abi.init!.args) {
                writeStackItem(a.name, a.type, w);
            }

            // Deploy
            w.append(`let codeCell = Cell.fromBoc(Buffer.from(__code, 'base64'))[0];`);
            w.append(`let executor = await createExecutorFromCode({ code: codeCell, data: new Cell() });`);
            w.append(`let res = await executor.get('${abi.init!.name}', __stack, { debug: true });`);
            w.append(`let data = res.stack.readCell();`);
            w.append(`return { code: codeCell, data };`);
        });
        w.append(`}`);
        w.append();
    }

    // Wrapper
    w.append(`export class ${abi.name} {`);
    w.inIndent(() => {
        w.append(`readonly executor: ContractExecutor; `);
        w.append(`constructor(executor: ContractExecutor) { this.executor = executor; } `);
        w.append();

        // Receivers
        if (abi.receivers.length > 0) {
            let receivers: string[] = [];
            for (const r of abi.receivers) {
                if (r.kind === 'internal-empty') {
                    receivers.push(`null`);
                } else if (r.kind === 'internal-binary') {
                    receivers.push(`${r.type}`);
                } else if (r.kind === 'internal-comment') {
                    receivers.push(`'${r.comment}'`);
                } else if (r.kind === 'internal-fallback') {
                    receivers.push(`Slice`);
                }
            }
            w.append(`async send(args: { amount: BN, from?: Address, debug?: boolean }, message: ${receivers.join(' | ')}) {`);
            w.inIndent(() => {
                w.append(`let body: Cell | null = null;`);
                for (const r of abi.receivers) {
                    if (r.kind === 'internal-binary') {
                        w.append(`if (message && typeof message === 'object' && !(message instanceof Slice) && message.$$type === '${r.type}') {`);
                        w.inIndent(() => {
                            w.append(`body = pack${r.type}(message);`);
                        });
                        w.append(`}`);
                    } else if (r.kind === 'internal-empty') {
                        w.append(`if (message === null) {`);
                        w.inIndent(() => {
                            w.append(`body = new Cell();`);
                        });
                        w.append(`}`);
                    } else if (r.kind === 'internal-comment') {
                        w.append(`if (message === '${r.comment}') {`);
                        w.inIndent(() => {
                            w.append(`body = beginCell().storeUint(0, 32).storeBuffer(Buffer.from(message)).endCell();`);
                        });
                        w.append(`}`);
                    } else if (r.kind === 'internal-fallback') {
                        w.append(`if (message && typeof message === 'object' && message instanceof Slice) {`);
                        w.inIndent(() => {
                            w.append(`body = message.toCell();`);
                        });
                        w.append(`}`);
                    }
                }
                w.append(`if (body === null) { throw new Error('Invalid message type'); }`);
                w.append(`await this.executor.internal(new InternalMessage({`);
                w.inIndent(() => {
                    w.append(`to: this.executor.address,`);
                    w.append(`from: args.from || this.executor.address,`);
                    w.append(`bounce: false,`);
                    w.append(`value: args.amount,`);
                    w.append(`body: new CommonMessageInfo({`);
                    w.inIndent(() => {
                        w.append(`body: new CellMessage(body!)`);
                    });
                    w.append(`})`);
                });
                w.append(`}), { debug: args.debug });`);
            });
            w.append(`}`);
        }

        // Getters
        for (let g of abi.getters) {
            w.append(`async get${changeCase.pascalCase(g.name)}(${writeArguments(g.args)}) {`);
            w.inIndent(() => {
                w.append(`let __stack: StackItem[] = [];`);
                for (let a of g.args) {
                    writeStackItem(a.name, a.type, w);
                }
                w.append(`let result = await this.executor.get('${g.name}', __stack);`);

                if (g.returns) {
                    if (g.returns.kind === 'ref') {
                        if (g.returns.name === 'Bool') {
                            w.append(`return result.stack.readBoolean();`);
                        } else if (g.returns.name === 'Int') {
                            w.append(`return result.stack.readBigNumber();`);
                        } else if (g.returns.name === 'Address') {
                            w.append(`return result.stack.readAddress()!;`);
                        } else {
                            // throw new Error(`Unsupported getter return type: ${g.returns.name}`);
                        }
                    } else {
                        w.append(`return result.stack.readCell();`);
                    }
                }
            });
            w.append(`}`);
        }
    });
    w.append(`}`);

    return w.end();
}