const API = import.meta.env.DEV ? 'http://localhost:4002' : '';
const STATIC_MODE = import.meta.env.VITE_STATIC_MODE === '1';
const STATIC_DB_KEY = 'qualityInspectionStaticDb';
const DIMENSION_LIBRARY_KEY = 'qualityInspectionDimensionLibrary';
const REPORT_FILE_LIBRARY_KEY = 'qualityInspectionReportFileLibrary';
const AUTH_USER_KEY = 'qualityInspectionUser';
const QUALITY_SEAL_IMAGE = `${import.meta.env.BASE_URL}assets/quality-seal.png`;
const DIMENSION_PREVIEW_ROW_LIMIT = 20;
const DEFAULT_ADMIN_USER = { id: 'u-admin', name: '孙立柱', password: '521sunlizhu', role: '管理员' };
const ROLE_ADMIN = '管理员';
const ROLE_USER = '普通用户';
const LEGACY_DEFAULT_USER_IDS = new Set(['u-purchaser', 'u-inspector', 'u-settlement']);
const LEGACY_ROLE_NAMES = new Set(['采购跟单员', '验货员', '结算员']);
const DEFAULT_USERS = [DEFAULT_ADMIN_USER];
const BUSINESS_DEPARTMENT_OPTIONS = ['全球招商事业部', '海外事业一部', '海外事业二部', '国内事业部', '美护事业部', '其他'];

const NOTICE_FIELDS = [
  { key: 'inspectionNotifier', label: '验货通知人', required: true },
  { key: 'inspectionFillTime', label: '验货填写时间', type: 'date', required: true },
  { key: 'supplierFinishTime', label: '供应商完工时间', type: 'date', required: true },
  { key: 'shipmentTime', label: '可验货时间', type: 'date', required: true },
  { key: 'stockOaNo', label: '备货OA号' },
  { key: 'shippingOaNo', label: '发货OA号' },
  { key: 'supplierShortName', label: '供应商简称', required: true },
  { key: 'supplierAddress', label: '地址' },
  { key: 'businessDepartments', label: '事业部', options: BUSINESS_DEPARTMENT_OPTIONS, required: true },
  { key: 'operation', label: '运营', required: true },
  { key: 'firstInspection', label: '是否首批验货', options: ['是', '否'], required: true },
  { key: 'salesProductLine', label: '产品线', required: true },
  { key: 'series', label: '系列', required: true },
  { key: 'totalQuantity', label: '合计数量', required: true },
  { key: 'skuQuantity', label: 'SKU及数量', multiline: true },
  { key: 'remark', label: '备注', multiline: true }
];

const NOTICE_IMPORT_ALIASES = {
  inspectionApplicant: ['验货填写人', '填写人', '申请人', '提报人'],
  inspectionNotifier: ['验货通知人', '通知人', '验货联系人', '联系人'],
  inspectionFillTime: ['验货填写时间', '填写时间', '申请时间', '提报时间', '通知时间'],
  supplierFinishTime: ['供应商完工时间', '完工时间', '供应商完成时间'],
  shipmentTime: ['可验货时间', '发货时间', '出货时间', '计划发货时间'],
  stockOaNo: ['备货OA号', '备货OA', '备货OA编号', '备货OA单号'],
  shippingOaNo: ['发货OA号', '发货OA', '发货OA编号', '发货OA单号'],
  kingdeeOrderNo: ['金蝶采购订单', '采购订单', '采购订单号', '金蝶订单', '订单号', 'PO', 'PO号'],
  supplierShortName: ['供应商简称', '供应商', '供应商名称', '厂家简称', '厂商', '厂家'],
  supplierAddress: ['供应商地址', '地址', '验货地址', '工厂地址', '地点', '地区'],
  businessDepartments: ['事业部', '业务部门', '部门'],
  operation: ['运营', '运营人员', '运营负责人'],
  firstInspection: ['是否首批验货', '首批验货', '是否首批', '首批'],
  salesProductLine: ['产品线', '销售产品线', '一级产品线', '品类', '产品品类'],
  series: ['系列', '产品系列'],
  totalQuantity: ['合计数量', '总数量', '数量', '验货数量'],
  skuQuantity: ['SKU及数量', 'SKU数量', 'SKU明细', 'SKU及数量明细', 'SKU'],
  remark: ['备注', '备注信息', '说明']
};

const SUMMARY_IMPORT_ALIASES = {
  scheduledDate: ['计划日期', '计划验货时间', '计划验货日期', '安排日期', '时间安排', '安排时间', '验货安排'],
  status: ['状态', '安排状态'],
  inspector: ['验货员', '验货人员', '验货人', '检验员'],
  reportNo: ['报告单号', '报告编号', '检验报告单编号', '检验报告单编码'],
  conclusion: ['报告结论', '检验报告结论'],
  feedbackResult: ['反馈结果', '验货结果', '检验结果'],
  actualInspectionTime: ['实际验货时间'],
  actualInspector: ['实际验货人', '实际检验员', '验货人员', '验货员', '验货人'],
  inspectionMethod: ['验货方式', '检验方式'],
  inspectionQuantity: ['实际验货数量', '验货数量'],
  checkQuantity: ['检验数量', '实际检验数量'],
  qualifiedQuantity: ['验货合格数量', '合格数量', '检验合格数量'],
  issueLevel: ['问题等级', '异常等级'],
  issueCategoryPrimary: ['问题分类', '一级问题分类', '问题大类'],
  feedbackText: ['问题反馈', '反馈内容', '问题描述', '验货反馈']
};

const FEEDBACK_IMPORT_ALIASES = {
  actualInspectionTime: ['实际验货时间', '验货时间', '实际检验时间', '检验时间'],
  inspectionMethod: ['验货方式', '检验方式'],
  inspectionQuantity: ['实际验货数量', '验货数量'],
  checkQuantity: ['检验数量', '实际检验数量'],
  qualifiedQuantity: ['验货合格数量', '合格数量', '检验合格数量'],
  result: ['验货结果', '检验结果', '反馈结果'],
  issueLevel: ['问题等级', '异常等级'],
  issueCategoryPrimary: ['问题分类', '一级问题分类', '问题大类'],
  feedbackText: ['问题反馈', '反馈内容', '问题描述', '验货反馈'],
  actualInspector: ['实际验货人', '实际检验人']
};

const MENU_PAGES = [
  { tab: 'inspectionNotice', label: '验货通知' },
  { tab: 'inspectionSchedule', label: '验货安排' },
  { tab: 'inspectionFeedback', label: '验货反馈' },
  { tab: 'reworkRecords', label: '复验通知' },
  { tab: 'inspectionStamp', label: '盖检验章' },
  { tab: 'inspectionReportQuery', label: '查检验单' },
  { tab: 'inspectionLedger', label: '验货台账' },
  { tab: 'dimensionLibrary', label: '维度表库' },
  { tab: 'inspectionReportLibrary', label: '报告单库' },
  { tab: 'backupCenter', label: '备份中心' },
  { tab: 'permissionManagement', label: '权限管理' },
  { tab: 'inspectionDashboard', label: '品质看板' },
  { tab: 'operationRecords', label: '操作记录' }
];

const PAGE_OPTIONS = [
  ...MENU_PAGES,
  { tab: 'inspectionInitialData', label: '验货信息初始数据' }
];

const ROLE_PAGE_ACCESS = {
  [ROLE_ADMIN]: PAGE_OPTIONS.map((page) => page.tab),
  [ROLE_USER]: []
};

const DIMENSION_LIBRARY_SLOTS = [
  { id: 'dimension-slot-1', title: '商品分类维表' },
  { id: 'dimension-slot-2', title: '采购分工明细' },
  { id: 'dimension-slot-3', title: '维度表槽位 3' },
  { id: 'dimension-slot-4', title: '维度表槽位 4' }
];
const PRODUCT_CATEGORY_SLOT_ID = 'dimension-slot-1';
const PURCHASE_WORK_DIVISION_SLOT_ID = 'dimension-slot-2';
const DIMENSION_SUPPLIER_ALIASES = ['产品线明细供应商', '供应商简称', '供应商', '供应商名称', '厂家简称', '厂商简称', '工厂简称'];
const DIMENSION_ADDRESS_ALIASES = ['产品线明细地址', '供应商地址', '验货地址', '工厂地址', '详细地址', '地址', '所在地'];
const DIMENSION_PROVINCE_ALIASES = ['省', '省份', '所在省', '省区'];
const DIMENSION_CITY_ALIASES = ['市', '城市', '所在市', '地市'];
const SALES_PRODUCT_LINE_ALIASES = ['销售产品线', '产品线', '一级产品线'];
const SALES_SERIES_ALIASES = ['销售系列', '系列', '产品系列'];
const NOTICE_IMPORT_MERGE_KEYS = ['inspectionApplicant', 'inspectionNotifier', 'inspectionFillTime', 'supplierFinishTime', 'shipmentTime', 'stockOaNo', 'shippingOaNo', 'kingdeeOrderNo', 'supplierShortName', 'supplierAddress', 'operation', 'firstInspection', 'salesProductLine', 'series', 'skuQuantity'];
const NOTICE_OPTIONAL_KEYS = new Set(['supplierAddress', 'stockOaNo', 'shippingOaNo', 'skuQuantity', 'remark']);
const REPORT_IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp']);
const REPORT_LIBRARY_EXTENSIONS = new Set(['.pdf', ...REPORT_IMAGE_EXTENSIONS, '.xlsx', '.xls', '.doc', '.docx']);
const RECORD_REFRESH_PAGES = ['inspectionNotice', 'inspectionSchedule', 'inspectionFeedback', 'inspectionLedger', 'inspectionReportQuery', 'inspectionStamp', 'inspectionReportLibrary', 'inspectionDashboard'];
const DIMENSION_REFRESH_PAGES = ['dimensionLibrary', 'inspectionNotice', 'inspectionSchedule', 'inspectionFeedback', 'inspectionLedger', 'inspectionReportQuery'];
const REPORT_FILE_REFRESH_PAGES = ['inspectionReportLibrary', 'inspectionReportQuery', 'inspectionStamp'];

export {
  API,
  STATIC_MODE,
  STATIC_DB_KEY,
  DIMENSION_LIBRARY_KEY,
  REPORT_FILE_LIBRARY_KEY,
  AUTH_USER_KEY,
  QUALITY_SEAL_IMAGE,
  DIMENSION_PREVIEW_ROW_LIMIT,
  DEFAULT_ADMIN_USER,
  ROLE_ADMIN,
  ROLE_USER,
  LEGACY_DEFAULT_USER_IDS,
  LEGACY_ROLE_NAMES,
  DEFAULT_USERS,
  BUSINESS_DEPARTMENT_OPTIONS,
  NOTICE_FIELDS,
  NOTICE_IMPORT_ALIASES,
  SUMMARY_IMPORT_ALIASES,
  FEEDBACK_IMPORT_ALIASES,
  MENU_PAGES,
  PAGE_OPTIONS,
  ROLE_PAGE_ACCESS,
  DIMENSION_LIBRARY_SLOTS,
  PRODUCT_CATEGORY_SLOT_ID,
  PURCHASE_WORK_DIVISION_SLOT_ID,
  DIMENSION_SUPPLIER_ALIASES,
  DIMENSION_ADDRESS_ALIASES,
  DIMENSION_PROVINCE_ALIASES,
  DIMENSION_CITY_ALIASES,
  SALES_PRODUCT_LINE_ALIASES,
  SALES_SERIES_ALIASES,
  NOTICE_IMPORT_MERGE_KEYS,
  NOTICE_OPTIONAL_KEYS,
  REPORT_IMAGE_EXTENSIONS,
  REPORT_LIBRARY_EXTENSIONS,
  RECORD_REFRESH_PAGES,
  DIMENSION_REFRESH_PAGES,
  REPORT_FILE_REFRESH_PAGES
};
