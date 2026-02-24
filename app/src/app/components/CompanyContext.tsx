"use client";

import {
  createContext,
  useContext,
  useState,
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
  const [activeCompanyId, setActiveCompanyIdRaw] = useState<string | null>(
    () => (typeof window !== "undefined" ? localStorage.getItem("active_company_id") : null)
  );
  const [companyVersion, setCompanyVersion] = useState(
    () => (typeof window !== "undefined" && localStorage.getItem("active_company_id") ? 1 : 0)
  );

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
