import { useState, useEffect } from 'react';

export type AiGenState = {
  isGenerating: boolean;
  current: number;
  total: number;
  generatingName: string;
  completedCount: number;
  hasError: boolean;
  justCompleted: boolean; // true → 완료 알림 표시용 (짧게 유지)
  isRefining: boolean;
  refineStudentName: string;
  refineLabel: string;
};

const initialState: AiGenState = {
  isGenerating: false,
  current: 0,
  total: 0,
  generatingName: '',
  completedCount: 0,
  hasError: false,
  justCompleted: false,
  isRefining: false,
  refineStudentName: '',
  refineLabel: '',
};

let state: AiGenState = { ...initialState };
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach(fn => fn());
}

export const aiGenStore = {
  getState: (): AiGenState => state,

  start: (total: number) => {
    state = { ...initialState, isGenerating: true, total, justCompleted: false };
    notify();
  },

  progress: (current: number, name: string) => {
    state = { ...state, current, generatingName: name };
    notify();
  },

  complete: (count: number) => {
    state = { ...state, isGenerating: false, generatingName: '', completedCount: count, justCompleted: true };
    notify();
    // 4초 후 완료 알림 자동 해제
    setTimeout(() => {
      state = { ...state, justCompleted: false };
      notify();
    }, 4000);
  },

  error: () => {
    state = { ...state, isGenerating: false, generatingName: '', hasError: true, justCompleted: true };
    notify();
    setTimeout(() => {
      state = { ...state, justCompleted: false, hasError: false };
      notify();
    }, 4000);
  },

  startRefine: (studentName: string, refineLabel: string) => {
    state = { ...state, isRefining: true, refineStudentName: studentName, refineLabel, justCompleted: false, hasError: false };
    notify();
  },

  endRefine: (hasError = false) => {
    state = { ...state, isRefining: false, refineStudentName: '', refineLabel: '', hasError, justCompleted: true };
    notify();
    setTimeout(() => {
      state = { ...state, justCompleted: false, hasError: false };
      notify();
    }, 3000);
  },

  subscribe: (fn: () => void) => {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
};

export function useAiGenStore(): AiGenState {
  const [, rerender] = useState(0);
  useEffect(() => {
    const unsubscribe = aiGenStore.subscribe(() => rerender(n => n + 1));
    return () => { unsubscribe(); };
  }, []);
  return aiGenStore.getState();
}
