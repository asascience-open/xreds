import MaterialIcon from "./material_icon";

interface NavBarProps {
    showSidebar: boolean;
    setSidebarShowing: (showing: boolean) => void;
}

export default function NavBar({showSidebar, setSidebarShowing}: NavBarProps) {
    return (
        <nav className="w-full h-8 p-2 flex flex-row items-center content-center justify-between">
            <div className="flex flex-row items-start content-center">
                <MaterialIcon
                    className="pr-4 self-center align-middle transition-all hover:text-blue-600"
                    name={showSidebar ? 'close' : 'menu'}
                    onClick={() => setSidebarShowing(!showSidebar)}
                />
                <span className="text-xl font-extrabold">xreds viewer</span>
            </div>
            <div className="flex flex-row items-start content-center">
                <a
                    className="text-xl font-extrabold hover:text-blue-600"
                    href={`/docs`}
                >
                    api
                </a>
                {/* <MaterialIcon className="px-4 self-center align-middle transition-all hover:text-blue-600" name='settings' title='Configure' onClick={() => { }} /> */}
            </div>
        </nav>
    );
}
