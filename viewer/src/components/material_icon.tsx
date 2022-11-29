import 'material-icons/iconfont/material-icons.css';
import { CSSProperties } from 'react';

export interface MaterialIconProps {
    name: string,
    type?: string
    size?: string,
    style?: CSSProperties,
    color?: string,
    rotation?: number,
    className?: string,
    onClick?: () => void,
}

const MaterialIcon = ({ color, name, size, style, rotation, className, onClick, type }: MaterialIconProps) => (
    <span
        className={`material-icons${(type !== undefined) ? "-" + type : ""} ${className}`}
        onClick={onClick}
        style={{
            color: color, 
            fontSize: size, 
            textAlign: 'center', 
            verticalAlign: 'middle',
            transform: `rotateZ(${rotation ?? 0}deg)`,
            ...((onClick !== undefined) && { cursor: "pointer" }),
            ...style,
        }}
    >
        {name}
    </span>
);

export default MaterialIcon;