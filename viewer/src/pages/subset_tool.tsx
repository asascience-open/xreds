import { useRef, useState } from 'react';
import NavBar from '../components/nav';
import Sidebar from '../components/sidebar';

export default function SubsetTool() {
    const map = useRef<maplibregl.Map | null>(null);
    const [showSidebar, setSidebarShowing] = useState(true);

    return (
        <div className="h-screen w-screen flex flex-col overflow-hidden">
            <NavBar showSidebar={showSidebar} setSidebarShowing={setSidebarShowing} />

            <Sidebar showSidebar={showSidebar}>

            </Sidebar>
        </div>
    );
}
