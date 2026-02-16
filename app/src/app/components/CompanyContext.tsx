"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";

type CompanyContextValue = {
  activeCompanyId: string | null;
  setActiveCompanyId: (id: string) => void;
  /** Increments on every company change — use as SWR key dep to force re-fetch */
  companyVersion: number;
};

const CompanyContext = createContext<CompanyContextValue>({
  activeCompanyId: null,
  setActiveCompanyId: () => {},
  companyVersion: 0,
});

export function useCompany() {
  return useContext(CompanyContext);
}

export function CompanyProvider({ children }: { children: ReactNode }) {
  const [activeCompanyId, setActiveCompanyIdRaw] = useState<string | null>(null);
  const [companyVersion, setCompanyVersion] = useState(0);

  useEffect(() => {
    const stored = localStorage.getItem("active_company_id");
    if (stored) {
      setActiveCompanyIdRaw(stored);
      setCompanyVersion((v) => v + 1);
    }
  }, []);

  const setActiveCompanyId = useCallback((id: string) => {
    setActiveCompanyIdRaw(id);
    setCompanyVersion((v) => v + 1);
    localStorage.setItem("active_company_id", id);
  }, []);

  return (
    <CompanyContext.Provider
      value={{ activeCompanyId, setActiveCompanyId, companyVersion }}
    >
      {children}
    </CompanyContext.Provider>
  );
}
