// context/UserContext.tsx
"use client";

import React, { createContext, useContext, useState, useEffect, ReactNode } from "react";

interface UserContextType {
  token: string | null;
  setToken: (token: string | null) => void;
  userValid: boolean;
  setUserValid: (valid: boolean) => void;
}

const UserContext = createContext<UserContextType | undefined>(undefined);

export const UserProvider = ({ children }: { children: ReactNode }) => {
  const [token, setTokenState] = useState<string | null>(null);
  const [userValid, setUserValid] = useState<boolean>(false);

  const setToken = (newToken: string | null) => {
    setTokenState(newToken);
    if (newToken) {
      localStorage.setItem("authToken", newToken);
    } else {
      localStorage.removeItem("authToken");
    }
  };

  useEffect(() => {
    const storedToken = localStorage.getItem("authToken");
    const wasValidated = sessionStorage.getItem("userValid");
    if (storedToken) {
      setTokenState(storedToken); // mantém token ao recarregar ou navegar
    }
    if (wasValidated === "true") {
    setUserValid(true);
  }
  }, []);

  return (
    <UserContext.Provider value={{ token, setToken, userValid, setUserValid }}>
      {children}
    </UserContext.Provider>
  );
};

export const useUser = () => {
  const context = useContext(UserContext);
  if (!context) {
    throw new Error("useUser deve ser usado dentro de um UserProvider");
  }
  return context;
};
