import {z} from 'zod';
import {toLatinDigits} from '@/lib/format';

const numberText=z.string().transform(value=>toLatinDigits(value).replace(/[\s-]/g,'').toUpperCase());
export const bankAccountSchema=z.object({
 id:z.uuid(),holder:z.string().trim().min(2,{message:'نام صاحب حساب را وارد کنید.'}).max(150),
 card:numberText.pipe(z.string().regex(/^(\d{16})?$/,{message:'شماره کارت باید ۱۶ رقم باشد.'})),
 iban:numberText.pipe(z.string().regex(/^(IR\d{24})?$/,{message:'شبا باید شامل IR و ۲۴ رقم باشد.'})),
 active:z.boolean(),
}).strict().refine(account=>Boolean(account.card||account.iban),{message:'شماره کارت یا شبا را وارد کنید.'});
export const bankTransferSettingsSchema=z.object({enabled:z.boolean(),accounts:z.array(bankAccountSchema).max(10)}).strict().superRefine((value,ctx)=>{
 if(value.enabled&&!value.accounts.some(account=>account.active))ctx.addIssue({code:'custom',path:['accounts'],message:'حداقل یک حساب فعال لازم است.'});
 for(const field of ['id','card','iban'] as const){const values=value.accounts.map(account=>account[field]).filter(Boolean);if(new Set(values).size!==values.length)ctx.addIssue({code:'custom',path:['accounts'],message:'حساب یا شماره تکراری است.'});}
});
export type BankTransferSettings=z.infer<typeof bankTransferSettingsSchema>;
export const emptyBankTransferSettings=():BankTransferSettings=>({enabled:false,accounts:[]});
export const bankTransferEditSchema=z.object({settings:bankTransferSettingsSchema,expectedUpdatedAt:z.iso.datetime().nullable()}).strict();
export const bankTransferSnapshotSchema=z.object({accounts:z.array(bankAccountSchema).min(1).max(10)}).strict();
export type BankTransferDetails={holder:string;card:string|null;iban:string|null;accounts:BankTransferSettings['accounts']};
