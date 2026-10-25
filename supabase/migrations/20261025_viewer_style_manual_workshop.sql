-- 보기 모양 E(manual)·F(workshop) 추가 — 아직 DB에 적용하지 않음 (승인 후 적용)
alter table public.class_materials drop constraint class_materials_viewer_style_chk;
alter table public.class_materials add constraint class_materials_viewer_style_chk
  check (viewer_style = any (array['default','mission','storybook','challenge','note','manual','workshop']));
