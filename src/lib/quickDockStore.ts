import { useSyncExternalStore } from 'react';
import type { LucideIcon } from 'lucide-react';

// 바로가기 버튼(전역)에 클래스룸 화면이 "지금 쓸 수 있는 전체 메뉴"를 맡겨 두는 작은 보관함.
// 클래스룸 밖에서는 비어 있어서 바로가기가 기본 메뉴(이동 버튼 위주)를 보여 준다.

export interface QuickItem { key: string; label: string; icon: LucideIcon; run: () => void; badge?: number }

interface DockState { items: QuickItem[] | null; hidden: boolean }

let state: DockState = { items: null, hidden: false };
const listeners = new Set<() => void>();

export const setQuickDock = (next: DockState) => {
  state = next;
  listeners.forEach(l => l());
};

const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };
const getSnapshot = () => state;

export const useQuickDockState = () => useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
