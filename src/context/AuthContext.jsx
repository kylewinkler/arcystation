import { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db, googleProvider } from '../lib/firebase';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    return onAuthStateChanged(auth, async (firebaseUser) => {
      try {
        if (firebaseUser) {
          const userRef = doc(db, 'users', firebaseUser.uid);
          const snap = await getDoc(userRef);
          if (!snap.exists()) {
            await setDoc(userRef, {
              displayName: firebaseUser.displayName,
              photoURL: firebaseUser.photoURL,
              email: firebaseUser.email,
              createdAt: serverTimestamp(),
            });
          } else {
            const stored = snap.data();
            if (
              stored.photoURL !== firebaseUser.photoURL ||
              stored.displayName !== firebaseUser.displayName
            ) {
              await setDoc(
                userRef,
                {
                  displayName: firebaseUser.displayName,
                  photoURL: firebaseUser.photoURL,
                },
                { merge: true }
              );
            }
          }
          setUser({
            uid: firebaseUser.uid,
            displayName: firebaseUser.displayName,
            photoURL: firebaseUser.photoURL,
            email: firebaseUser.email,
          });
        } else {
          setUser(null);
        }
      } catch (err) {
        console.error('Auth state sync failed:', err);
        setUser(null);
      } finally {
        setLoading(false);
      }
    });
  }, []);

  const login = () => signInWithPopup(auth, googleProvider);
  const logout = () => signOut(auth);

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
