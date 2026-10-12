import { createContext, useContext } from 'react';

export const DashboardAuthContext = createContext({ logout: async () => {} });
export const useDashboardAuth = () => useContext(DashboardAuthContext);