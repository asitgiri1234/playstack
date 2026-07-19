'use client';

import { createContext, useContext } from 'react';
import type { OrgTreeNode } from '@playstack/shared';

/**
 * Shared tree UI state, so a deeply-nested node can toggle its own row and the
 * expand-all/collapse-all controls can drive every node — without threading
 * callbacks through every level of the recursion.
 */
export interface TreeContextValue {
  isExpanded: (id: string) => boolean;
  toggle: (id: string) => void;
  selectedId: string | null;
  select: (node: OrgTreeNode) => void;
}

const TreeContext = createContext<TreeContextValue | null>(null);

export const TreeProvider = TreeContext.Provider;

export function useTreeContext(): TreeContextValue {
  const ctx = useContext(TreeContext);
  if (ctx === null) throw new Error('useTreeContext must be used within a TreeProvider');
  return ctx;
}
