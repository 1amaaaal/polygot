// Every language that can be the answer, with the traits players get
// feedback on. To add a language, add an entry here and at least two
// snippets for it in snippets.txt.
//
//   paradigm:  Object-oriented | Functional | Procedural | Multi-paradigm | Logic | Declarative
//   typing:    Static | Dynamic | Untyped
//   execution: Native | VM | Interpreted | JIT | Transpiled
//   family:    the language whose syntax it looks most like

export const LANGUAGES = [
  { name: "Python", year: 1991, paradigm: "Multi-paradigm", typing: "Dynamic", execution: "Interpreted", family: "Indentation" },
  { name: "JavaScript", year: 1995, paradigm: "Multi-paradigm", typing: "Dynamic", execution: "JIT", family: "C-like" },
  { name: "TypeScript", year: 2012, paradigm: "Multi-paradigm", typing: "Static", execution: "Transpiled", family: "C-like" },
  { name: "Java", year: 1995, paradigm: "Object-oriented", typing: "Static", execution: "VM", family: "C-like" },
  { name: "C", year: 1972, paradigm: "Procedural", typing: "Static", execution: "Native", family: "C-like" },
  { name: "C++", year: 1985, paradigm: "Multi-paradigm", typing: "Static", execution: "Native", family: "C-like" },
  { name: "C#", year: 2000, paradigm: "Object-oriented", typing: "Static", execution: "VM", family: "C-like" },
  { name: "Go", year: 2009, paradigm: "Procedural", typing: "Static", execution: "Native", family: "C-like" },
  { name: "Rust", year: 2015, paradigm: "Multi-paradigm", typing: "Static", execution: "Native", family: "C-like" },
  { name: "Swift", year: 2014, paradigm: "Multi-paradigm", typing: "Static", execution: "Native", family: "C-like" },
  { name: "Kotlin", year: 2011, paradigm: "Multi-paradigm", typing: "Static", execution: "VM", family: "C-like" },
  { name: "Dart", year: 2011, paradigm: "Object-oriented", typing: "Static", execution: "VM", family: "C-like" },
  { name: "Scala", year: 2004, paradigm: "Multi-paradigm", typing: "Static", execution: "VM", family: "C-like" },
  { name: "Zig", year: 2016, paradigm: "Procedural", typing: "Static", execution: "Native", family: "C-like" },
  { name: "PHP", year: 1995, paradigm: "Multi-paradigm", typing: "Dynamic", execution: "Interpreted", family: "C-like" },
  { name: "Perl", year: 1987, paradigm: "Multi-paradigm", typing: "Dynamic", execution: "Interpreted", family: "C-like" },
  { name: "Ruby", year: 1995, paradigm: "Object-oriented", typing: "Dynamic", execution: "Interpreted", family: "Ruby-like" },
  { name: "Elixir", year: 2012, paradigm: "Functional", typing: "Dynamic", execution: "VM", family: "Ruby-like" },
  { name: "Lua", year: 1993, paradigm: "Multi-paradigm", typing: "Dynamic", execution: "Interpreted", family: "Algol/Pascal" },
  { name: "Pascal", year: 1970, paradigm: "Procedural", typing: "Static", execution: "Native", family: "Algol/Pascal" },
  { name: "Haskell", year: 1990, paradigm: "Functional", typing: "Static", execution: "Native", family: "ML-like" },
  { name: "OCaml", year: 1996, paradigm: "Functional", typing: "Static", execution: "Native", family: "ML-like" },
  { name: "Clojure", year: 2007, paradigm: "Functional", typing: "Dynamic", execution: "VM", family: "Lisp" },
  { name: "Scheme", year: 1975, paradigm: "Functional", typing: "Dynamic", execution: "Interpreted", family: "Lisp" },
  { name: "Bash", year: 1989, paradigm: "Procedural", typing: "Dynamic", execution: "Interpreted", family: "Shell" },
  { name: "PowerShell", year: 2006, paradigm: "Multi-paradigm", typing: "Dynamic", execution: "Interpreted", family: "Shell" },
  { name: "SQL", year: 1974, paradigm: "Declarative", typing: "Static", execution: "Interpreted", family: "Declarative" },
  { name: "Prolog", year: 1972, paradigm: "Logic", typing: "Dynamic", execution: "Interpreted", family: "Declarative" },
  { name: "R", year: 1993, paradigm: "Multi-paradigm", typing: "Dynamic", execution: "Interpreted", family: "Scientific" },
  { name: "Julia", year: 2012, paradigm: "Multi-paradigm", typing: "Dynamic", execution: "JIT", family: "Scientific" },
  { name: "MATLAB", year: 1984, paradigm: "Multi-paradigm", typing: "Dynamic", execution: "Interpreted", family: "Scientific" },
  { name: "Fortran", year: 1957, paradigm: "Procedural", typing: "Static", execution: "Native", family: "Scientific" },
  { name: "COBOL", year: 1959, paradigm: "Procedural", typing: "Static", execution: "Native", family: "Other" },
  { name: "x86 Assembly", year: 1978, paradigm: "Procedural", typing: "Untyped", execution: "Native", family: "Other" },
  { name: "VB.NET", year: 2001, paradigm: "Object-oriented", typing: "Static", execution: "VM", family: "BASIC" },
];

export const TRAITS = [
  { key: "paradigm", label: "Paradigm" },
  { key: "year", label: "Year" },
  { key: "typing", label: "Typing" },
  { key: "execution", label: "Runs as" },
  { key: "family", label: "Looks like" },
];
