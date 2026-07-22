import { ReactNode } from "react";

interface FilterBarProps {
  children: ReactNode;
}

export function FilterBar({ children }: FilterBarProps) {
  return (
    <div className="flex items-center gap-3 mb-4 flex-wrap">
      {children}
    </div>
  );
}
