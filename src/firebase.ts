import { initializeApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  User,
} from 'firebase/auth';
import {
  getFirestore,
  doc,
  collection,
  setDoc,
  deleteDoc,
  getDocFromServer,
  onSnapshot,
  getDocs,
  query,
  limit,
} from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';
import { ActiveRoomInfo, DemoVideo, WatchedMovieRecord } from './types';

// Initialize Firebase
export const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

// Error Handling Requirements from Firebase Integration Skill
export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((p) => ({
          providerId: p.providerId,
          email: p.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// Connection test on boot as mandated by skill
async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.warn('Firebase client is offline or network restricted.');
    }
  }
}
testConnection();

// Authentication Helpers
export async function signInWithGoogle(): Promise<User | null> {
  try {
    const result = await signInWithPopup(auth, googleProvider);
    if (result.user) {
      // Save user profile
      const userRef = doc(db, 'users', result.user.uid);
      await setDoc(
        userRef,
        {
          uid: result.user.uid,
          displayName: result.user.displayName || 'Guest User',
          photoURL: result.user.photoURL || '',
          email: result.user.email || '',
          createdAt: new Date().toISOString(),
        },
        { merge: true }
      );
    }
    return result.user;
  } catch (err: unknown) {
    console.error('Google Sign-In failed:', err);
    throw err;
  }
}

export async function signOutUser(): Promise<void> {
  await signOut(auth);
}

// Rooms synchronization in Firestore
export async function saveRoomToFirestore(room: ActiveRoomInfo): Promise<void> {
  const roomPath = `rooms/${room.code}`;
  try {
    const user = auth.currentUser;
    const roomRef = doc(db, 'rooms', room.code);
    await setDoc(
      roomRef,
      {
        code: room.code,
        hostUid: user?.uid || 'guest-host',
        hostName: room.hostName || user?.displayName || 'Host',
        movieTitle: room.movieTitle || 'Video Stream',
        movieUrl: room.movieUrl || '',
        viewerCount: room.viewerCount || 1,
        lastSeen: Date.now(),
        createdAt: new Date(room.createdAt).toISOString(),
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    );
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, roomPath);
  }
}

export async function deleteRoomFromFirestore(roomCode: string): Promise<void> {
  const roomPath = `rooms/${roomCode}`;
  try {
    const roomRef = doc(db, 'rooms', roomCode);
    await deleteDoc(roomRef);
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, roomPath);
  }
}

export async function fetchFirestoreRooms(): Promise<ActiveRoomInfo[]> {
  const roomsPath = 'rooms';
  try {
    const q = query(collection(db, roomsPath), limit(25));
    const snapshot = await getDocs(q);
    const rooms: ActiveRoomInfo[] = [];
    snapshot.forEach((docSnap) => {
      const d = docSnap.data();
      rooms.push({
        code: d.code || docSnap.id,
        hostName: d.hostName || 'Host',
        movieTitle: d.movieTitle || 'Video Stream',
        movieUrl: d.movieUrl || '',
        viewerCount: d.viewerCount || 1,
        createdAt: d.createdAt ? new Date(d.createdAt).getTime() : Date.now(),
        lastSeen: d.lastSeen || Date.now(),
      });
    });
    return rooms;
  } catch (err) {
    console.debug('Failed to fetch rooms from Firestore:', err);
    return [];
  }
}

// Saved Samples synchronization in Firestore
export async function saveSampleToFirestore(sample: DemoVideo): Promise<void> {
  const user = auth.currentUser;
  if (!user) return;
  const sId = sample.id || 'sample-' + Date.now().toString(36);
  const samplePath = `users/${user.uid}/savedSamples/${sId}`;
  try {
    const sampleRef = doc(db, 'users', user.uid, 'savedSamples', sId);
    await setDoc(sampleRef, {
      id: sId,
      userId: user.uid,
      title: sample.title,
      category: sample.category || 'Custom Movie',
      url: sample.url,
      duration: sample.duration || '',
      thumbnail: sample.thumbnail || '',
      createdAt: new Date().toISOString(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, samplePath);
  }
}

export async function deleteSampleFromFirestore(sampleId: string): Promise<void> {
  const user = auth.currentUser;
  if (!user) return;
  const samplePath = `users/${user.uid}/savedSamples/${sampleId}`;
  try {
    const sampleRef = doc(db, 'users', user.uid, 'savedSamples', sampleId);
    await deleteDoc(sampleRef);
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, samplePath);
  }
}

export function subscribeToUserSamples(
  userId: string,
  callback: (samples: DemoVideo[]) => void
): () => void {
  const path = `users/${userId}/savedSamples`;
  return onSnapshot(
    collection(db, 'users', userId, 'savedSamples'),
    (snapshot) => {
      const samples: DemoVideo[] = [];
      snapshot.forEach((docSnap) => {
        const d = docSnap.data();
        const mediaType = (d.url?.includes('youtube.com') || d.url?.includes('youtu.be')
          ? 'youtube'
          : d.url?.includes('.m3u8')
          ? 'hls'
          : 'video') as 'video' | 'hls' | 'youtube';
        samples.push({
          id: d.id || docSnap.id,
          title: d.title || 'Movie Video',
          category: d.category || 'Custom Movie',
          url: d.url || '',
          type: mediaType,
          duration: d.duration || 'Watched',
          description: d.description || 'Saved movie in Library',
          thumbnail: d.thumbnail,
          isCustom: true,
        });
      });
      callback(samples);
    },
    (err) => {
      handleFirestoreError(err, OperationType.LIST, path);
    }
  );
}

// Watched Movies history in Firestore
export async function saveWatchedMovieToFirestore(movie: WatchedMovieRecord): Promise<void> {
  const user = auth.currentUser;
  if (!user) return;
  const path = `users/${user.uid}/watchedMovies/${movie.id}`;
  try {
    const movieRef = doc(db, 'users', user.uid, 'watchedMovies', movie.id);
    await setDoc(
      movieRef,
      {
        id: movie.id,
        userId: user.uid,
        title: movie.title,
        url: movie.url,
        watchCount: movie.watchCount,
        lastWatchedAt: new Date(movie.lastWatchedAt).toISOString(),
      },
      { merge: true }
    );
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export function subscribeToUserWatchedMovies(
  userId: string,
  callback: (movies: WatchedMovieRecord[]) => void
): () => void {
  const path = `users/${userId}/watchedMovies`;
  return onSnapshot(
    collection(db, 'users', userId, 'watchedMovies'),
    (snapshot) => {
      const records: WatchedMovieRecord[] = [];
      snapshot.forEach((docSnap) => {
        const d = docSnap.data();
        const mediaType = (d.url?.includes('youtube.com') || d.url?.includes('youtu.be')
          ? 'youtube'
          : d.url?.includes('.m3u8')
          ? 'hls'
          : 'video') as 'video' | 'hls' | 'youtube';
        records.push({
          id: d.id || docSnap.id,
          title: d.title || 'Movie',
          url: d.url || '',
          type: mediaType,
          watchCount: d.watchCount || 1,
          lastWatchedAt: d.lastWatchedAt ? new Date(d.lastWatchedAt).getTime() : Date.now(),
          isSavedAsSample: true,
        });
      });
      callback(records);
    },
    (err) => {
      handleFirestoreError(err, OperationType.LIST, path);
    }
  );
}
