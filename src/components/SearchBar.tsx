import { Search, Sparkles, X } from "lucide-react";
import { useState, useRef, useEffect } from "react";

interface SearchBarProps {
  onSearch: (query: string) => void;
  loading: boolean;
  initialValue?: string;
}

const SUGGESTIONS = [
  "What is Deep Learning?",
  "Introduction to React Hooks",
  "How do neural networks work?",
  "Python data structures",
  "Understanding Machine Learning",
  "Linear algebra for beginners",
  "REST API design best practices",
  "Docker containerization guide",
];

export function SearchBar({ onSearch, loading, initialValue = "" }: SearchBarProps) {
  const [value, setValue] = useState(initialValue);
  const [focused, setFocused] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setValue(initialValue);
  }, [initialValue]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = value.trim();
    if (trimmed && !loading) {
      onSearch(trimmed);
      setShowSuggestions(false);
    }
  }

  function handleSuggestion(s: string) {
    setValue(s);
    onSearch(s);
    setShowSuggestions(false);
    inputRef.current?.blur();
  }

  return (
    <div ref={wrapperRef} className="relative w-full">
      <form onSubmit={handleSubmit} className="relative">
        <div
          className={`relative flex items-center gap-2 rounded-2xl border-2 bg-white transition-all duration-300 ${
            focused
              ? "border-brand-500 shadow-lg shadow-brand-500/10 scale-[1.01]"
              : "border-ink-200 shadow-md shadow-ink-900/5 hover:border-ink-300"
          }`}
        >
          <div className="flex items-center justify-center pl-5">
            <Search
              className={`h-5 w-5 transition-colors ${focused ? "text-brand-500" : "text-ink-400"}`}
              strokeWidth={2.2}
            />
          </div>
          <input
            ref={inputRef}
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onFocus={() => {
              setFocused(true);
              setShowSuggestions(true);
            }}
            onBlur={() => setFocused(false)}
            placeholder="Enter a topic or question, e.g. 'What is Deep Learning?'"
            className="flex-1 bg-transparent py-4 pr-3 text-base text-ink-900 placeholder:text-ink-400 focus:outline-none"
            disabled={loading}
          />
          {value && !loading && (
            <button
              type="button"
              onClick={() => {
                setValue("");
                inputRef.current?.focus();
              }}
              className="p-1.5 text-ink-400 hover:text-ink-600 transition-colors"
              aria-label="Clear search"
            >
              <X className="h-4 w-4" />
            </button>
          )}
          <button
            type="submit"
            disabled={loading || !value.trim()}
            className="mr-2 flex items-center gap-2 rounded-xl bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white transition-all duration-300 hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed hover:shadow-lg hover:shadow-brand-600/20 active:scale-95"
          >
            <Sparkles className="h-4 w-4" />
            {loading ? "Searching..." : "Search"}
          </button>
        </div>
      </form>

      {showSuggestions && (
        <div className="absolute top-full left-0 right-0 mt-2 rounded-xl border border-ink-200 bg-white shadow-xl shadow-ink-900/10 overflow-hidden z-50 animate-slide-down">
          <p className="px-4 py-2 text-xs font-semibold uppercase tracking-wide text-ink-400">
            Try one of these
          </p>
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              onClick={() => handleSuggestion(s)}
              className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm text-ink-700 hover:bg-brand-50 hover:text-brand-700 transition-colors"
            >
              <Search className="h-3.5 w-3.5 text-ink-400" />
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
