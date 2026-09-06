import { useRef } from 'react';

/**
 * 모달 배경(backdrop) 클릭 시 닫는 핸들러를 만든다.
 * mousedown과 click이 모두 배경 위에서 일어난 경우에만 닫는다 — 모달 안의 텍스트를
 * 드래그로 선택하다가 마우스가 배경으로 나간 채 놓이면 브라우저가 배경에서 click을
 * 발생시키는데, target === currentTarget 만 검사하면 이때도 닫혀버리는 문제가 있었다.
 */
export function useBackdropClose(onClose: () => void) {
  const downOnBackdrop = useRef(false);

  const onMouseDown = (e: React.MouseEvent) => {
    downOnBackdrop.current = e.target === e.currentTarget;
  };

  const onClick = (e: React.MouseEvent) => {
    if (downOnBackdrop.current && e.target === e.currentTarget) onClose();
    downOnBackdrop.current = false;
  };

  return { onMouseDown, onClick };
}
