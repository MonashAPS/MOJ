export type NavNode = {
  _id: string;
  key: string;
  label: string;
  path: string;
  regex: string;
  order: number;
  children: NavNode[];
};

/** DMOJ marks a nav item active by matching its regex against the path. */
export function activeNavKeys(nodes: NavNode[], pathname: string): Set<string> {
  const active = new Set<string>();
  const walk = (list: NavNode[]): boolean => {
    let anyActive = false;
    for (const node of list) {
      const childActive = walk(node.children);
      let selfActive = false;
      if (node.regex) {
        try {
          selfActive = new RegExp(node.regex).test(pathname);
        } catch {
          selfActive = false;
        }
      }
      if (selfActive || childActive) {
        active.add(node.key);
        anyActive = true;
      }
    }
    return anyActive;
  };
  walk(nodes);
  return active;
}
