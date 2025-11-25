import { 
  doc, 
  collection, 
  addDoc,
  getDoc, 
  getDocs, 
  setDoc, 
  updateDoc, 
  deleteDoc, 
  query, 
  where, 
  orderBy, 
  serverTimestamp,
  Timestamp,
  writeBatch
} from 'firebase/firestore';
import { firestore } from './firebase';

export interface FirestoreUserProfile {
  displayName: string;
  email: string;
  plan: 'free' | 'pro';
  usageLimit: {
    monthlyRequests: number;
    lastResetDate: string;
    currentMonth: string;
  };
  sessionData: {
    activeSessionId?: string;
    lastSessionAt?: Timestamp;
  };
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface FirestoreSession {
  title: string;
  session_type: string;
  startedAt: Timestamp;
  endedAt?: Timestamp;
}

export interface FirestoreTranscript {
  startAt: Timestamp;
  endAt: Timestamp;
  speaker: 'me' | 'other';
  text: string;
  lang?: string;
  createdAt: Timestamp;
}

export interface FirestoreAiMessage {
  sentAt: Timestamp;
  role: 'user' | 'assistant';
  content: string;
  tokens?: number;
  model?: string;
  createdAt: Timestamp;
}

export interface FirestoreSummary {
  generatedAt: Timestamp;
  model: string;
  text: string;
  tldr: string;
  bulletPoints: string[];
  actionItems: Array<{ owner: string; task: string; due: string }>;
  tokensUsed?: number;
}

export interface FirestorePromptPreset {
  title: string;
  content: string;
  isDefault: boolean;
  createdAt: Timestamp;
}

export class FirestoreUserService {
  static async createUser(uid: string, profile: Omit<FirestoreUserProfile, 'createdAt' | 'updatedAt'>) {
    const userRef = doc(firestore, 'users', uid);
    const now = serverTimestamp();
    await setDoc(userRef, {
      ...profile,
      createdAt: now,
      updatedAt: now
    });
  }

  static async getUser(uid: string): Promise<FirestoreUserProfile | null> {
    const userRef = doc(firestore, 'users', uid);
    const userSnap = await getDoc(userRef);
    return userSnap.exists() ? userSnap.data() as FirestoreUserProfile : null;
  }

  static async updateUser(uid: string, updates: Partial<FirestoreUserProfile>) {
    const userRef = doc(firestore, 'users', uid);
    await updateDoc(userRef, {
      ...updates,
      updatedAt: serverTimestamp()
    });
  }

  static async getUserPlan(uid: string): Promise<'free' | 'pro'> {
    const user = await this.getUser(uid);
    return user?.plan || 'free';
  }

  static async updateUserPlan(uid: string, plan: 'free' | 'pro') {
    await this.updateUser(uid, { plan });
  }

  static async getUserUsage(uid: string) {
    const user = await this.getUser(uid);
    if (!user) {
      return {
        monthlyRequests: 0,
        lastResetDate: new Date().toISOString(),
        currentMonth: new Date().getFullYear() + '-' + (new Date().getMonth() + 1)
      };
    }
    return user.usageLimit;
  }

  static async updateUserUsage(uid: string, usageData: FirestoreUserProfile['usageLimit']) {
    await this.updateUser(uid, { usageLimit: usageData });
  }

  static async incrementUsage(uid: string) {
    const user = await this.getUser(uid);
    if (!user) return;

    const currentDate = new Date();
    const currentMonth = currentDate.getFullYear() + '-' + (currentDate.getMonth() + 1);
    
    let usageLimit = user.usageLimit;
    
    if (usageLimit.currentMonth !== currentMonth) {
      usageLimit = {
        monthlyRequests: 1,
        lastResetDate: currentDate.toISOString(),
        currentMonth: currentMonth
      };
    } else {
      usageLimit.monthlyRequests += 1;
    }

    await this.updateUser(uid, { usageLimit });
  }

  static async getActiveSession(uid: string): Promise<string | null> {
    const user = await this.getUser(uid);
    return user?.sessionData?.activeSessionId || null;
  }

  static async setActiveSession(uid: string, sessionId: string | null) {
    await this.updateUser(uid, { 
      sessionData: { 
        activeSessionId: sessionId || undefined,
        lastSessionAt: sessionId ? serverTimestamp() as Timestamp : undefined
      }
    });
  }

  static async deleteUser(uid: string) {
    const batch = writeBatch(firestore);
    
    const sessionsRef = collection(firestore, 'users', uid, 'sessions');
    const sessionsSnap = await getDocs(sessionsRef);
    
    for (const sessionDoc of sessionsSnap.docs) {
      const sessionId = sessionDoc.id;
      
      const transcriptsRef = collection(firestore, 'users', uid, 'sessions', sessionId, 'transcripts');
      const transcriptsSnap = await getDocs(transcriptsRef);
      transcriptsSnap.docs.forEach(doc => batch.delete(doc.ref));
      
      const aiMessagesRef = collection(firestore, 'users', uid, 'sessions', sessionId, 'aiMessages');
      const aiMessagesSnap = await getDocs(aiMessagesRef);
      aiMessagesSnap.docs.forEach(doc => batch.delete(doc.ref));
      
      const summaryRef = doc(firestore, 'users', uid, 'sessions', sessionId, 'summary', 'data');
      batch.delete(summaryRef);
      
      batch.delete(sessionDoc.ref);
    }
    
    const presetsRef = collection(firestore, 'users', uid, 'promptPresets');
    const presetsSnap = await getDocs(presetsRef);
    presetsSnap.docs.forEach(doc => batch.delete(doc.ref));
    
    const userRef = doc(firestore, 'users', uid);
    batch.delete(userRef);
    
    await batch.commit();
  }
}

export class FirestoreSessionService {
  static async createSession(uid: string, session: Omit<FirestoreSession, 'startedAt'>): Promise<string> {
    const sessionsRef = collection(firestore, 'users', uid, 'sessions');
    const docRef = await addDoc(sessionsRef, {
      ...session,
      startedAt: serverTimestamp()
    });
    
    await FirestoreUserService.setActiveSession(uid, docRef.id);
    
    return docRef.id;
  }

  static async getSession(uid: string, sessionId: string): Promise<FirestoreSession | null> {
    const sessionRef = doc(firestore, 'users', uid, 'sessions', sessionId);
    const sessionSnap = await getDoc(sessionRef);
    return sessionSnap.exists() ? sessionSnap.data() as FirestoreSession : null;
  }

  static async getAllSessions(uid: string): Promise<Array<FirestoreSession & { id: string }>> {
    const sessionsRef = collection(firestore, 'users', uid, 'sessions');
    const q = query(sessionsRef, orderBy('startedAt', 'desc'));
    const querySnapshot = await getDocs(q);
    
    return querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data() as FirestoreSession
    }));
  }

  static async updateSession(uid: string, sessionId: string, updates: Partial<FirestoreSession>) {
    const sessionRef = doc(firestore, 'users', uid, 'sessions', sessionId);
    await updateDoc(sessionRef, updates);
  }

  static async endSession(uid: string, sessionId: string) {
    await this.updateSession(uid, sessionId, { endedAt: serverTimestamp() as Timestamp });
    
    const activeSessionId = await FirestoreUserService.getActiveSession(uid);
    if (activeSessionId === sessionId) {
      await FirestoreUserService.setActiveSession(uid, null);
    }
  }

  static async deleteSession(uid: string, sessionId: string) {
    const batch = writeBatch(firestore);
    
    const transcriptsRef = collection(firestore, 'users', uid, 'sessions', sessionId, 'transcripts');
    const transcriptsSnap = await getDocs(transcriptsRef);
    transcriptsSnap.docs.forEach(doc => batch.delete(doc.ref));
    
    const aiMessagesRef = collection(firestore, 'users', uid, 'sessions', sessionId, 'aiMessages');
    const aiMessagesSnap = await getDocs(aiMessagesRef);
    aiMessagesSnap.docs.forEach(doc => batch.delete(doc.ref));
    
    const summaryRef = doc(firestore, 'users', uid, 'sessions', sessionId, 'summary', 'data');
    batch.delete(summaryRef);
    
    const sessionRef = doc(firestore, 'users', uid, 'sessions', sessionId);
    batch.delete(sessionRef);
    
    await batch.commit();
    
    const activeSessionId = await FirestoreUserService.getActiveSession(uid);
    if (activeSessionId === sessionId) {
      await FirestoreUserService.setActiveSession(uid, null);
    }
  }
}

export class FirestoreTranscriptService {
  static async addTranscript(uid: string, sessionId: string, transcript: Omit<FirestoreTranscript, 'createdAt'>): Promise<string> {
    const transcriptsRef = collection(firestore, 'users', uid, 'sessions', sessionId, 'transcripts');
    const docRef = await addDoc(transcriptsRef, {
      ...transcript,
      createdAt: serverTimestamp()
    });
    return docRef.id;
  }

  static async getTranscripts(uid: string, sessionId: string): Promise<Array<FirestoreTranscript & { id: string }>> {
    const transcriptsRef = collection(firestore, 'users', uid, 'sessions', sessionId, 'transcripts');
    const q = query(transcriptsRef, orderBy('startAt', 'asc'));
    const querySnapshot = await getDocs(q);
    
    return querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data() as FirestoreTranscript
    }));
  }
}

export class FirestoreAiMessageService {
  static async addMessage(uid: string, sessionId: string, message: Omit<FirestoreAiMessage, 'createdAt'>): Promise<string> {
    const messagesRef = collection(firestore, 'users', uid, 'sessions', sessionId, 'aiMessages');
    const docRef = await addDoc(messagesRef, {
      ...message,
      createdAt: serverTimestamp()
    });
    return docRef.id;
  }

  static async getMessages(uid: string, sessionId: string): Promise<Array<FirestoreAiMessage & { id: string }>> {
    const messagesRef = collection(firestore, 'users', uid, 'sessions', sessionId, 'aiMessages');
    const q = query(messagesRef, orderBy('sentAt', 'asc'));
    const querySnapshot = await getDocs(q);
    
    return querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data() as FirestoreAiMessage
    }));
  }
}

export class FirestoreSummaryService {
  static async saveSummary(uid: string, sessionId: string, summary: FirestoreSummary) {
    const summaryRef = doc(firestore, 'users', uid, 'sessions', sessionId, 'summary', 'data');
    await setDoc(summaryRef, summary);
  }

  static async getSummary(uid: string, sessionId: string): Promise<FirestoreSummary | null> {
    const summaryRef = doc(firestore, 'users', uid, 'sessions', sessionId, 'summary', 'data');
    const summarySnap = await getDoc(summaryRef);
    return summarySnap.exists() ? summarySnap.data() as FirestoreSummary : null;
  }
}

export class FirestorePresetService {
  static async createPreset(uid: string, preset: Omit<FirestorePromptPreset, 'createdAt'>): Promise<string> {
    const presetsRef = collection(firestore, 'users', uid, 'promptPresets');
    const docRef = await addDoc(presetsRef, {
      ...preset,
      createdAt: serverTimestamp()
    });
    return docRef.id;
  }

  static async getPresets(uid: string): Promise<Array<FirestorePromptPreset & { id: string }>> {
    const presetsRef = collection(firestore, 'users', uid, 'promptPresets');
    const q = query(presetsRef, orderBy('createdAt', 'desc'));
    const querySnapshot = await getDocs(q);
    
    return querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data() as FirestorePromptPreset
    }));
  }

  static async updatePreset(uid: string, presetId: string, updates: Partial<FirestorePromptPreset>) {
    const presetRef = doc(firestore, 'users', uid, 'promptPresets', presetId);
    await updateDoc(presetRef, updates);
  }

  static async deletePreset(uid: string, presetId: string) {
    const presetRef = doc(firestore, 'users', uid, 'promptPresets', presetId);
    await deleteDoc(presetRef);
  }
}