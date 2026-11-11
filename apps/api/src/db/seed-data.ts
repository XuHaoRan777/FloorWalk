export const seedPhoto = Buffer.from(
  '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAF//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABBQJ//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAwEBPwF//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAgEBPwF//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQAGPwJ//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPyF//9oADAMBAAIAAwAAABAf/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAwEBPxB//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAgEBPxB//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxB//9oADAMBAAIAAwAAABAf/9k=',
  'base64',
);

const templateItems = [
  ['门头灯箱', 0, false],
  ['地面清洁', 0, false],
  ['冷柜温度', 1, false],
  ['食品效期', 1, false],
  ['收银台整洁', 0, false],
  ['物料陈列', 0, false],
  ['员工着装', 0, false],
  ['闭店记录', 0, false],
] as const;

export const seedItems = templateItems.map(
  ([title, minPhotoCount, critical], index) => ({
    position: index + 1,
    title,
    min_photo_count: minPhotoCount,
    acceptance_criteria: '',
    critical,
  }),
);
