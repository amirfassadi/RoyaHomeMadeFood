 'use client';
import {createContext,useContext} from 'react';
import {noAdminAccess,type AdminAccess} from '@/lib/admin/permissions';
export const AdminAccessContext=createContext<AdminAccess>(noAdminAccess);
export function useAdminAccess(){return useContext(AdminAccessContext);}
