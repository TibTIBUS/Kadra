import { Outlet } from 'react-router-dom';
import { ToastProvider } from './components/ui/Toast';

export default function App() {
  return (
    <ToastProvider>
      <Outlet />
    </ToastProvider>
  );
}
