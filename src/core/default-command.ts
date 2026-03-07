export function applyDefaultGoArgs(argv: string[]): string[] {
  if (argv.length <= 2) {
    return [...argv, "go"];
  }
  const args = argv.slice(2);
  const hasHelpOrVersion = args.includes("--help") || args.includes("-h") || args.includes("--version") || args.includes("-V");
  if (hasHelpOrVersion) {
    return argv;
  }
  const first = args[0] ?? "";
  if (first.startsWith("-")) {
    return [...argv.slice(0, 2), "go", ...args];
  }
  return argv;
}
