'use client';
import {useEffect,useState} from 'react';
import Link from 'next/link';
import {useLocale,useTranslations} from 'next-intl';
import {ReceiptCard,type Receipt} from './checkout-form';
import {buttonClasses} from '@/components/ui/button';
export function PaymentResult(){const [receipt,setReceipt]=useState<Receipt|null>(null),t=useTranslations('Shop'),locale=useLocale();useEffect(()=>{try{const r=JSON.parse(sessionStorage.getItem('roya-receipt')??'null');if(r && typeof r.trackingCode==='string' && /^ROYA-[A-F0-9]{24}$/.test(r.trackingCode) && Number.isSafeInteger(r.totalToman) && r.totalToman>=0 && Number.isFinite(Date.parse(r.estimatedDeliveryAt)))setReceipt(r);}catch{}},[]);return <><p className="mb-8 max-w-2xl text-sm leading-7">{t('resultNote')}</p>{receipt?<ReceiptCard receipt={receipt}/>:<><p className="mb-6">{t('receiptMissing')}</p><Link className={buttonClasses()} href={`/${locale}/tracking/`}>{t('tracking')}</Link></>}</>;}
