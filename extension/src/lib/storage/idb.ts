/**
 * IndexedDB 管理器
 *
 * 提供统一的数据库操作接口，支持：
 * - 数据库初始化和版本管理
 * - 通用 CRUD 操作
 * - 批量写入
 * - 缓存管理（带 TTL）
 */

import type {
  UnpublishedItem,
  SiteErrorItem,
  SkuMapping,
  ApiCache
} from '~types/storage';

const DB_NAME = 'autotemu-db';
const DB_VERSION = 4;  // V4: site_errors 表主键改为 [mallId, skcId]，支持去重更新

/**
 * IndexedDB 数据库管理器
 */
class DatabaseManager {
  private db: IDBDatabase | null = null;

  /**
   * 检查数据库连接是否有效
   */
  private isConnectionValid(): boolean {
    if (!this.db) return false;
    try {
      // 尝试访问 objectStoreNames 来验证连接有效性
      this.db.objectStoreNames;
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 初始化数据库
   * 如果连接无效则重新打开
   */
  async init(): Promise<IDBDatabase> {
    // 检查现有连接是否有效
    if (this.isConnectionValid()) {
      return this.db!;
    }

    // 清理无效连接
    this.db = null;

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => {
        console.error('[IDB] 数据库打开失败:', request.error);
        reject(request.error);
      };

      request.onsuccess = () => {
        this.db = request.result;

        // 监听连接关闭事件
        this.db.onclose = () => {
          console.log('[IDB] 数据库连接已关闭');
          this.db = null;
        };

        console.log('[IDB] 数据库初始化成功');
        resolve(this.db);
      };

      request.onupgradeneeded = (event) => {
        console.log('[IDB] 数据库升级中...');
        const db = (event.target as IDBOpenDBRequest).result;
        this.createStores(db);
      };
    });
  }

  /**
   * 创建数据表（Store）
   * 仅在数据库升级时调用
   */
  private createStores(db: IDBDatabase): void {
    // 1. 已下架记录表（V3: 每个店铺每天一条记录）
    // 如果存在旧表，先删除
    if (db.objectStoreNames.contains('unpublished')) {
      db.deleteObjectStore('unpublished');
      console.log('[IDB] 删除旧表: unpublished');
    }
    // 创建新表
    const unpublishedStore = db.createObjectStore('unpublished', {
      // 复合主键：[mallId, unPublishedDate]
      // 同一店铺同一天只存储一条记录
      keyPath: ['mallId', 'unPublishedDate']
    });
    // 索引：按店铺查询
    unpublishedStore.createIndex('mallId', 'mallId', { unique: false });
    // 索引：按日期查询
    unpublishedStore.createIndex('unPublishedDate', 'unPublishedDate', { unique: false });
    // 索引：查询未推送的记录
    unpublishedStore.createIndex('pushed', 'pushed', { unique: false });
    console.log('[IDB] 创建表: unpublished (V3)');

    // 2. 站点异常表（V4: 主键改为 [mallId, skcId]，支持去重更新）
    if (db.objectStoreNames.contains('site_errors')) {
      db.deleteObjectStore('site_errors');
      console.log('[IDB] 删除旧表: site_errors');
    }
    const siteErrorsStore = db.createObjectStore('site_errors', {
      // 复合主键：[mallId, skcId]（同一店铺同一 SKC 只保留一条，更新时覆盖）
      keyPath: ['mallId', 'skcId']
    });
    // 索引：按店铺查询
    siteErrorsStore.createIndex('mallId', 'mallId', { unique: false });
    // 索引：按检查时间查询
    siteErrorsStore.createIndex('checkedAt', 'checkedAt', { unique: false });
    console.log('[IDB] 创建表: site_errors (V4)');

    // 3. SKU 映射表（goodsSkuId -> skcId）
    if (!db.objectStoreNames.contains('sku_mapping')) {
      const skuMappingStore = db.createObjectStore('sku_mapping', {
        // 复合主键：[mallId, goodsSkuId]
        keyPath: ['mallId', 'goodsSkuId']
      });
      // 索引：按店铺查询
      skuMappingStore.createIndex('mallId', 'mallId', { unique: false });
      console.log('[IDB] 创建表: sku_mapping');
    }

    // 4. API 缓存表
    if (!db.objectStoreNames.contains('api_cache')) {
      const cacheStore = db.createObjectStore('api_cache', {
        keyPath: 'key'
      });
      // 索引：按过期时间查询（用于清理过期缓存）
      cacheStore.createIndex('expiry', 'expiry', { unique: false });
      console.log('[IDB] 创建表: api_cache');
    }
  }

  // ============================================
  // 通用 CRUD 操作
  // ============================================

  /**
   * 添加数据（如果已存在则失败）
   */
  async add(storeName: string, data: any): Promise<void> {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      const request = store.add(data);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * 保存或更新数据（覆盖已存在的数据）
   */
  async put(storeName: string, data: any): Promise<void> {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      const request = store.put(data);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * 获取单条数据
   */
  async get(storeName: string, key: any): Promise<any> {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      const request = store.get(key);

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * 获取所有数据
   * @param indexName 可选：按索引查询
   * @param query 可选：查询条件（如店铺 ID）
   */
  async getAll(
    storeName: string,
    indexName?: string,
    query?: any
  ): Promise<any[]> {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      const target = indexName ? store.index(indexName) : store;
      const request = target.getAll(query);

      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * 删除数据
   */
  async delete(storeName: string, key: any): Promise<void> {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      const request = store.delete(key);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * 清空表数据
   */
  async clear(storeName: string): Promise<void> {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      const request = store.clear();

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  // ============================================
  // 批量操作
  // ============================================

  /**
   * 批量保存或更新数据
   * @returns 成功数量和错误列表
   */
  async putBatch(
    storeName: string,
    items: any[]
  ): Promise<{ success: number; errors: any[] }> {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);

      let completed = 0;
      const errors: any[] = [];

      items.forEach((item) => {
        const request = store.put(item);

        request.onsuccess = () => {
          completed++;
          if (completed === items.length) {
            resolve({ success: items.length - errors.length, errors });
          }
        };

        request.onerror = () => {
          errors.push(request.error);
          completed++;
          if (completed === items.length) {
            resolve({ success: items.length - errors.length, errors });
          }
        };
      });

      // 处理空数组情况
      if (items.length === 0) {
        resolve({ success: 0, errors: [] });
      }
    });
  }

  // ============================================
  // 缓存管理
  // ============================================

  /**
   * 设置缓存
   * @param key 缓存键
   * @param value 缓存值
   * @param ttlMinutes 过期时间（分钟，默认 30 分钟）
   */
  async setCache(key: string, value: any, ttlMinutes: number = 30): Promise<void> {
    const cacheItem: ApiCache = {
      key,
      value,
      expiry: Date.now() + ttlMinutes * 60 * 1000,
      createdAt: Date.now()
    };
    await this.put('api_cache', cacheItem);
  }

  /**
   * 获取缓存
   * 如果缓存过期则自动删除并返回 null
   */
  async getCache(key: string): Promise<any> {
    const item = await this.get('api_cache', key);
    if (!item) return null;

    // 检查是否过期
    if (Date.now() > item.expiry) {
      await this.delete('api_cache', key);
      console.log('[IDB] 缓存已过期:', key);
      return null;
    }

    return item.value;
  }

  /**
   * 清理过期缓存
   * @returns 删除的缓存数量
   */
  async clearExpiredCache(): Promise<number> {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('api_cache', 'readwrite');
      const store = tx.objectStore('api_cache');
      const index = store.index('expiry');
      const now = Date.now();

      const range = IDBKeyRange.upperBound(now);
      const request = index.openCursor(range);

      let deleted = 0;

      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest).result;
        if (cursor) {
          cursor.delete();
          deleted++;
          cursor.continue();
        } else {
          console.log('[IDB] 清理过期缓存:', deleted, '条');
          resolve(deleted);
        }
      };

      request.onerror = () => reject(request.error);
    });
  }

  // ============================================
  // 数据统计
  // ============================================

  /**
   * 获取表中的记录数
   */
  async count(storeName: string, indexName?: string, query?: any): Promise<number> {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      const target = indexName ? store.index(indexName) : store;
      const request = target.count(query);

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
}

// 导出单例
export default new DatabaseManager();
