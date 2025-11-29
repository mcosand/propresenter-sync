"use client";

import { createContext, useContext } from 'react';
import { ProPresenterStore } from '@/services/propresenterStore';

const context = createContext<ProPresenterStore | undefined>(undefined);

export const StoreProvider = context.Provider;
export function useStore(): ProPresenterStore {
  const c = useContext(context);
  if (!c) {
    throw new Error("useStore must be used within a <MyStoreProvider>");
  }
  return c;
}