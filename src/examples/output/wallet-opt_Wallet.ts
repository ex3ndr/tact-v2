import { Cell, Slice, StackItem, Address, Builder, InternalMessage, CommonMessageInfo, CellMessage, beginCell, serializeDict } from 'ton';
import { ContractExecutor, createExecutorFromCode } from 'ton-nodejs';
import BN from 'bn.js';

export type SendParameters = {
    $$type: 'SendParameters';
    bounce: boolean;
    to: Address;
    value: BN;
    mode: BN;
    body: Cell | null;
    code: Cell | null;
    data: Cell | null;
}

export function packSendParameters(src: SendParameters): Cell {
    let b_0 = new Builder();
    b_0 = b_0.storeBit(src.bounce);
    b_0 = b_0.storeAddress(src.to);
    b_0 = b_0.storeInt(src.value, 257);
    b_0 = b_0.storeInt(src.mode, 257);
    if (src.body !== null) {
        b_0 = b_0.storeBit(true);
        b_0 = b_0.storeRef(src.body);
    } else {
        b_0 = b_0.storeBit(false);
    }
    if (src.code !== null) {
        b_0 = b_0.storeBit(true);
        b_0 = b_0.storeRef(src.code);
    } else {
        b_0 = b_0.storeBit(false);
    }
    if (src.data !== null) {
        b_0 = b_0.storeBit(true);
        b_0 = b_0.storeRef(src.data);
    } else {
        b_0 = b_0.storeBit(false);
    }
    return b_0.endCell();
}

export function packStackSendParameters(src: SendParameters, to: StackItem[]) {
    to.push({ type: 'int', value: src.bounce ? new BN(-1): new BN(0) });
    to.push({ type: 'slice', cell: beginCell().storeAddress(src.to).endCell() });
    to.push({ type: 'int', value: src.value });
    to.push({ type: 'int', value: src.mode });
    if (src.body === null) {
        to.push({ type: 'null' });
    } else {
        to.push({ type: 'cell', cell: src.body });
    }
    if (src.code === null) {
        to.push({ type: 'null' });
    } else {
        to.push({ type: 'cell', cell: src.code });
    }
    if (src.data === null) {
        to.push({ type: 'null' });
    } else {
        to.push({ type: 'cell', cell: src.data });
    }
}

export type Context = {
    $$type: 'Context';
    bounced: boolean;
    sender: Address;
    value: BN;
}

export function packContext(src: Context): Cell {
    let b_0 = new Builder();
    b_0 = b_0.storeBit(src.bounced);
    b_0 = b_0.storeAddress(src.sender);
    b_0 = b_0.storeInt(src.value, 257);
    return b_0.endCell();
}

export function packStackContext(src: Context, to: StackItem[]) {
    to.push({ type: 'int', value: src.bounced ? new BN(-1): new BN(0) });
    to.push({ type: 'slice', cell: beginCell().storeAddress(src.sender).endCell() });
    to.push({ type: 'int', value: src.value });
}

export type StateInit = {
    $$type: 'StateInit';
    code: Cell;
    data: Cell;
}

export function packStateInit(src: StateInit): Cell {
    let b_0 = new Builder();
    b_0 = b_0.storeRef(src.code);
    b_0 = b_0.storeRef(src.data);
    return b_0.endCell();
}

export function packStackStateInit(src: StateInit, to: StackItem[]) {
    to.push({ type: 'cell', cell: src.code });
    to.push({ type: 'cell', cell: src.data });
}

export type TransferMessage = {
    $$type: 'TransferMessage';
    signature: Slice;
    transfer: Slice;
}

export function packTransferMessage(src: TransferMessage): Cell {
    let b_0 = new Builder();
    b_0 = b_0.storeUint(1843760589, 32);
    b_0 = b_0.storeCellCopy(src.signature.toCell());
    b_0 = b_0.storeCellCopy(src.transfer.toCell());
    return b_0.endCell();
}

export function packStackTransferMessage(src: TransferMessage, to: StackItem[]) {
    to.push({ type: 'slice', cell: src.signature.toCell() });
    to.push({ type: 'slice', cell: src.transfer.toCell() });
}

export async function Wallet_init(key: BN, walletId: BN) {
    const __code = 'te6ccgECFAEAAT4AART/APSkE/S88sgLAQIBYgIDAgLMBAUCASAODwIBIAYHAgFICgsA69OBDrpOEPypgQa4WP7wFoaYGAuNhgAMi/yLhxAP0gGCogireB/DCBSK3wQQg28sbm3Uce9qJoagD8MWmP6f/pn6qQNgmB6Y+AwQg28sbm3XlwMkGEa4wzGQgaIYB4BWR8IQDmKpAoEeWP5f/ln+T2qnAYeWAyQCAVgICQAfHADyMxVIFAjyx/L/8s/yYAAFDAxgAgEgDA0ANUIPkBVBAk+RDyqtIf0gfUMFEluvKrBKQE+wCAAFGwhgAAMW4AIBIBARACu+AldqJoagD8MWmP6f/pn6qQNgn4BEAAm7oT8AaAIBSBITACuzJftRNDUAfhi0x/T/9M/VSBsE/AJgACuwfjtRNDUAfhi0x/T/9M/VSBsE/AHg';
    const depends = new Map<string, Cell>();
    let systemCell = beginCell().storeDict(null).endCell();
    let __stack: StackItem[] = [];
    __stack.push({ type: 'cell', cell: systemCell });
    __stack.push({ type: 'int', value: key });
    __stack.push({ type: 'int', value: walletId });
    let codeCell = Cell.fromBoc(Buffer.from(__code, 'base64'))[0];
    let executor = await createExecutorFromCode({ code: codeCell, data: new Cell() });
    let res = await executor.get('init_Wallet', __stack, { debug: true });
    let data = res.stack.readCell();
    return { code: codeCell, data };
}

export class Wallet {
    readonly executor: ContractExecutor; 
    constructor(executor: ContractExecutor) { this.executor = executor; } 
    
    async send(args: { amount: BN, from?: Address, debug?: boolean }, message: TransferMessage) {
        let body: Cell | null = null;
        if (message && typeof message === 'object' && !(message instanceof Slice) && message.$$type === 'TransferMessage') {
            body = packTransferMessage(message);
        }
        if (body === null) { throw new Error('Invalid message type'); }
        await this.executor.internal(new InternalMessage({
            to: this.executor.address,
            from: args.from || this.executor.address,
            bounce: false,
            value: args.amount,
            body: new CommonMessageInfo({
                body: new CellMessage(body!)
            })
        }), { debug: args.debug });
    }
    async getPublicKey() {
        let __stack: StackItem[] = [];
        let result = await this.executor.get('publicKey', __stack);
        return result.stack.readBigNumber();
    }
    async getWalletId() {
        let __stack: StackItem[] = [];
        let result = await this.executor.get('walletId', __stack);
        return result.stack.readBigNumber();
    }
    async getSeqno() {
        let __stack: StackItem[] = [];
        let result = await this.executor.get('seqno', __stack);
        return result.stack.readBigNumber();
    }
}