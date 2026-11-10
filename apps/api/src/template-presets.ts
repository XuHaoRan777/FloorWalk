import type { QuickSetupTemplateRequest, TemplateItem } from '@libs/shared';

type TemplatePreset = {
  templateName: string;
  standardName: string;
  prompt: string;
  items: Array<
    Pick<
      TemplateItem,
      'title' | 'minPhotoCount' | 'acceptanceCriteria' | 'critical'
    >
  >;
};

export const templatePresets: Record<
  QuickSetupTemplateRequest['kind'],
  TemplatePreset
> = {
  coffee: {
    templateName: '咖啡店巡检模板',
    standardName: '咖啡店 AI 审核标准',
    prompt:
      '逐项对照验收要点审核咖啡店现场照片，关注操作台清洁、食品存放和客区整洁。只依据照片中可见的信息判断；无法确认的内容说明原因，不推测温度、效期或操作过程。',
    items: [
      {
        title: '咖啡操作台与器具',
        minPhotoCount: 2,
        acceptanceCriteria:
          '操作台无明显污渍、积水和残渣，咖啡器具清洁并分类摆放。',
        critical: true,
      },
      {
        title: '原料存放',
        minPhotoCount: 1,
        acceptanceCriteria: '原料容器加盖，标签清晰，食品与清洁用品分开存放。',
        critical: true,
      },
      {
        title: '客区与取餐区',
        minPhotoCount: 1,
        acceptanceCriteria: '桌面和取餐台无垃圾、明显污渍，通道无堆物。',
        critical: false,
      },
    ],
  },
  restaurant: {
    templateName: '餐馆巡检模板',
    standardName: '餐馆 AI 审核标准',
    prompt:
      '逐项对照验收要点审核餐馆现场照片，关注备餐卫生、食材分类存放和就餐区整洁。只依据照片中可见的信息判断；无法确认的内容说明原因，不推测温度、效期或消毒效果。',
    items: [
      {
        title: '备餐台与工具',
        minPhotoCount: 2,
        acceptanceCriteria:
          '备餐台无明显污渍、残渣，生熟食工具分开并有清晰标识。',
        critical: true,
      },
      {
        title: '食材存放',
        minPhotoCount: 1,
        acceptanceCriteria: '食材加盖或密封，生熟食分开，食品不直接接触地面。',
        critical: true,
      },
      {
        title: '就餐区环境',
        minPhotoCount: 1,
        acceptanceCriteria: '桌椅和地面无明显污渍、垃圾，通道保持畅通。',
        critical: false,
      },
    ],
  },
  florist: {
    templateName: '花店巡检模板',
    standardName: '花店 AI 审核标准',
    prompt:
      '逐项对照验收要点审核花店现场照片，关注花材状态、修剪工具收纳和陈列环境。只依据照片中可见的信息判断；无法确认的内容说明原因，不推测花材寿命或养护操作过程。',
    items: [
      {
        title: '花材与养护容器',
        minPhotoCount: 2,
        acceptanceCriteria:
          '花材无明显腐烂、霉斑，养护容器无明显污垢和漂浮垃圾。',
        critical: false,
      },
      {
        title: '修剪工具与工作台',
        minPhotoCount: 1,
        acceptanceCriteria:
          '剪刀等尖锐工具妥善收纳，工作台无散落刀具和堆积花材废料。',
        critical: true,
      },
      {
        title: '陈列与通道',
        minPhotoCount: 1,
        acceptanceCriteria: '花束陈列整齐，地面无明显积水和垃圾，通道无堆物。',
        critical: false,
      },
    ],
  },
};
