// Codes in hierarchical depth-first order, for dropdowns and code trees.
// `withDepth` adds a `depth` field (0 = root) so trees can indent children
// under parents. Extracted from the copy-pasted version that lived in both
// QuickCodeModal and ExportFilterModal.
export const buildDropdownTree = (codes, withDepth = false) => {
  const ordered = [];

  const visit = (parentId, depth) => {
    const children = codes.filter((code) => code.parent_id === parentId);
    children.forEach((child) => {
      ordered.push(withDepth ? { ...child, depth } : child);
      visit(child.id, depth + 1);
    });
  };
  visit(null, 0);

  // Safety net from the original copy: root-level codes the DFS pass missed
  // (parent_id undefined instead of null) still belong in the list.
  codes.forEach((code) => {
    if (!code.parent_id && !ordered.find((orderedCode) => orderedCode.id === code.id)) {
      ordered.push(withDepth ? { ...code, depth: 0 } : code);
    }
  });

  return ordered;
};