import { ReactNode } from 'react';

interface SidebarProps {
    showSidebar: boolean;
    children: ReactNode;
}

export default function Sidebar({ showSidebar, ...props }: SidebarProps) {
    return (
        <aside
            className={`absolute top-8 left-0 bottom-0 z-10 shadow-xl flex bg-white flex-col transition-all overflow-y-auto ${showSidebar ? 'w-full px-4 py-2' : 'w-0 px-0 py-0'} ${showSidebar ? 'md:w-1/3' : 'md:w-0'}`}
        >
            {props.children}
        </aside>
    );
}
