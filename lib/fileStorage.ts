"use client";

// IndexedDB storage for media files
const DB_NAME = 'ClipStormMedia';
const DB_VERSION = 2;
const STORE_NAME = 'mediaFiles';

interface StoredFile {
  id: string;
  name: string;
  type: string;
  data: ArrayBuffer;
  addedAt: number;
}

class FileStorage {
  private db: IDBDatabase | null = null;

  async init(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };
      
      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        const oldVersion = event.oldVersion;
        const newVersion = event.newVersion;
        
        console.log(`🔄 IndexedDB upgrade: ${oldVersion} → ${newVersion}`);
        
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
          store.createIndex('name', 'name', { unique: false });
          store.createIndex('type', 'type', { unique: false });
          console.log(`✅ Created object store: ${STORE_NAME}`);
        }
      };
    });
  }

  async storeFile(id: string, file: File): Promise<void> {
    if (!this.db) await this.init();
    
    return new Promise((resolve, reject) => {
      // Read the file first
      const reader = new FileReader();
      reader.onload = () => {
        // Create a new transaction after file reading is complete
        const transaction = this.db!.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        
        const storedFile: StoredFile = {
          id,
          name: file.name,
          type: file.type,
          data: reader.result as ArrayBuffer,
          addedAt: Date.now()
        };
        
        const request = store.put(storedFile);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      };
      reader.onerror = () => reject(reader.error);
      reader.readAsArrayBuffer(file);
    });
  }

  async getFile(id: string): Promise<File | null> {
    if (!this.db) await this.init();
    
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(id);
      
      request.onsuccess = () => {
        const storedFile = request.result as StoredFile;
        if (!storedFile) {
          resolve(null);
          return;
        }
        
        const file = new File([storedFile.data], storedFile.name, { type: storedFile.type });
        resolve(file);
      };
      request.onerror = () => reject(request.error);
    });
  }

  async deleteFile(id: string): Promise<void> {
    if (!this.db) await this.init();
    
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.delete(id);
      
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async getAllFileIds(): Promise<string[]> {
    if (!this.db) await this.init();
    
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.getAllKeys();
      
      request.onsuccess = () => resolve(request.result as string[]);
      request.onerror = () => reject(request.error);
    });
  }

  async clearAllFiles(): Promise<void> {
    if (!this.db) await this.init();
    
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.clear();
      
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }
}

export const fileStorage = new FileStorage();
