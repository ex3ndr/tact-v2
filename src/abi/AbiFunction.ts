import { ASTRef, throwError } from "../ast/ast";
import { CompilerContext } from "../ast/context";
import { WriterContext } from "../generator/Writer";
import { getType } from "../types/resolveTypeDescriptors";
import { TypeRef } from "../types/types";

export type AbiFunction = {
    name: string;
    resolve: (ctx: CompilerContext, args: (TypeRef | null)[], ref: ASTRef) => TypeRef | null;
    generate: (ctx: WriterContext, args: (TypeRef | null)[], resolved: string[], ref: ASTRef) => string;
}

export const ABIFunctions: { [key: string]: AbiFunction } = {
    pack_cell: {
        name: 'pack_cell',
        resolve: (ctx, args, ref) => {
            if (args.length !== 1) {
                throwError('pack_cell expects 1 argument', ref);
            }
            if (args[0] === null || args[0].kind !== 'direct') {
                throwError('pack_cell expects a direct type', ref);
            }
            let tp = getType(ctx, args[0].name);
            if (tp.kind !== 'struct') {
                throwError('pack_cell expects a struct type', ref);
            }
            return { kind: 'direct', name: 'Cell' };
        },
        generate: (ctx, args, resolved, ref) => {
            if (args.length !== 1) {
                throwError('pack_cell expects 1 argument', ref);
            }
            if (args[0] === null || args[0].kind !== 'direct') {
                throwError('pack_cell expects a direct type', ref);
            }
            let tp = getType(ctx.ctx, args[0].name);
            if (tp.kind !== 'struct') {
                throwError('pack_cell expects a struct type', ref);
            }
            return '__gen_writecell_' + args[0].name + '(' + resolved.join(', ') + ')';
        }
    },
    pack_slice: {
        name: 'pack_slice',
        resolve: (ctx, args, ref) => {
            if (args.length !== 1) {
                throwError('pack_slice expects 1 argument', ref);
            }
            if (args[0] === null || args[0].kind !== 'direct') {
                throwError('pack_slice expects a direct type', ref);
            }
            let tp = getType(ctx, args[0].name);
            if (tp.kind !== 'struct') {
                throwError('pack_slice expects a struct type', ref);
            }
            return { kind: 'direct', name: 'Slice' };
        },
        generate: (ctx, args, resolved, ref) => {
            if (args.length !== 1) {
                throwError('pack_slice expects 1 argument', ref);
            }
            if (args[0] === null || args[0].kind !== 'direct') {
                throwError('pack_slice expects a direct type', ref);
            }
            let tp = getType(ctx.ctx, args[0].name);
            if (tp.kind !== 'struct') {
                throwError('pack_slice expects a struct type', ref);
            }
            return '__gen_writeslice_' + args[0].name + '(' + resolved.join(', ') + ')';
        }
    }
};