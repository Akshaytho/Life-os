export function isTodayPath(path: string): boolean {
  return path === "/" || path === "/today" || path.startsWith("/today/");
}
