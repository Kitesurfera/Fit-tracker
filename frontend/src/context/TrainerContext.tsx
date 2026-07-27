import React, { createContext, useState, useContext } from 'react';

type TrainerContextType = {
  selectedAthlete: any | null;
  setSelectedAthlete: (athlete: any | null) => void;
};

const TrainerContext = createContext<TrainerContextType>({
  selectedAthlete: null,
  setSelectedAthlete: () => {},
});

export const TrainerProvider = ({ children }: { children: React.ReactNode }) => {
  const [selectedAthlete, setSelectedAthlete] = useState<any | null>(null);
  
  return (
    <TrainerContext.Provider value={{ selectedAthlete, setSelectedAthlete }}>
      {children}
    </TrainerContext.Provider>
  );
};

export const useTrainer = () => useContext(TrainerContext);
