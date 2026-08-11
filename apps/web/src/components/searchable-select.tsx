"use client";

import { useState, type ChangeEvent } from "react";
import { Select, type SelectOption, type SelectProps } from "./select";

interface SearchableSelectProps extends Omit<SelectProps, "options"> {
  options: SelectOption[];
  searchLabel: string;
  searchValue: string;
  onSearchChange: (value: string) => void;
  selectedOption?: SelectOption;
}

/**
 * Native select backed by a debounced server query in the owning page. The
 * chosen option is retained while a later search result page no longer
 * contains it, so filtering choices and form values cannot silently reset.
 */
export function SearchableSelect({
  options,
  searchLabel,
  searchValue,
  onSearchChange,
  selectedOption,
  value,
  onChange,
  ...selectProps
}: SearchableSelectProps) {
  const [retained, setRetained] = useState<SelectOption | undefined>();
  const selectedValue = typeof value === "string" ? value : "";
  const matchingOption = options.find(
    (option) => option.value === selectedValue,
  );
  const retainedOption =
    matchingOption ??
    (selectedOption?.value === selectedValue ? selectedOption : undefined) ??
    (retained?.value === selectedValue ? retained : undefined);
  const displayedOptions =
    retainedOption &&
    !options.some((option) => option.value === retainedOption.value)
      ? [...options, retainedOption]
      : options;

  function handleChange(event: ChangeEvent<HTMLSelectElement>) {
    const chosen = options.find(
      (option) => option.value === event.target.value,
    );
    setRetained(chosen);
    onChange?.(event);
  }

  return (
    <div className="flex flex-col gap-1.5">
      <input
        type="search"
        aria-label={searchLabel}
        placeholder="Search options…"
        value={searchValue}
        onChange={(event) => onSearchChange(event.target.value)}
        className="h-10 rounded-[var(--radius)] border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
      />
      <Select
        {...selectProps}
        value={value}
        onChange={handleChange}
        options={displayedOptions}
      />
    </div>
  );
}
