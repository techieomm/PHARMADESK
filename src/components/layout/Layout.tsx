import React, { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { Navbar } from './Navbar';
import { Sidebar } from './Sidebar';

export const Layout: React.FC = () => {
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);

  return (
    <div className="app-shell bg-cream-50 font-sans text-charcoal-900">
      <Navbar onToggleMobileSidebar={() => setIsMobileSidebarOpen(prev => !prev)} />
      <div className="app-body">
        <Sidebar
          isOpenMobile={isMobileSidebarOpen}
          onCloseMobile={() => setIsMobileSidebarOpen(false)}
        />
        <main className="main-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
};
