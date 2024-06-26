import { useState } from 'react';
import MaterialIcon from './material_icon';

interface CopyUrlProps {
    url: string;
    text: string;
    linkTitle: boolean;
    disabled: boolean;
    origin_path?: string;
}

export default function CopyUrl({
    url,
    text,
    linkTitle,
    disabled,
    origin_path,
}: CopyUrlProps) {
    const [copied, setCopied] = useState(false);

    return (
        <div
            className={`flex flex-row items-center py-2 ${disabled ? 'text-gray-400' : 'cursor-pointer text-blue-500'}`}
            onClick={
                linkTitle || disabled
                    ? undefined
                    : () => {
                          const host =
                              window.location.protocol +
                              '//' +
                              window.location.host;
                          let path = origin_path
                              ? window.location.pathname.split(origin_path)[0]
                              : window.location.pathname;
                          if (path.includes(import.meta.env.VITE_XREDS_BASE_URL)) {
                                path = path.replace(import.meta.env.VITE_XREDS_BASE_URL, '');
                          }
                          if (path.endsWith('/')) {
                              path = path.slice(0, -1);
                          }
                          const copy_url = `${host}${path}${url}`;
                          window.navigator.clipboard
                              .writeText(`${copy_url}`)
                              .then(() => {
                                  setCopied(true);
                              });
                      }
            }
        >
            <MaterialIcon
                name={copied ? 'check' : 'content_copy'}
                className={`mr-4`}
                onClick={
                    linkTitle && !disabled
                        ? () => {
                              const host =
                                  window.location.protocol +
                                  '//' +
                                  window.location.host;
                              let path = origin_path
                                  ? window.location.pathname.split(
                                        origin_path,
                                    )[0]
                                  : window.location.pathname;
                              if (path.includes(import.meta.env.VITE_XREDS_BASE_URL)) {
                                    path = path.replace(import.meta.env.VITE_XREDS_BASE_URL, '');
                              }
                              if (path.endsWith('/')) {
                                  path = path.slice(0, -1);
                              }
                              const copy_url = `${host}${path}${url}`;
                              window.navigator.clipboard.writeText(
                                  `${copy_url}`,
                              );
                              setCopied(true);
                          }
                        : undefined
                }
            />
            {linkTitle && !disabled ? (
                <a
                    href={url}
                    target="_blank"
                    rel="noreferrer"
                    className={`underline`}
                >
                    {text}
                </a>
            ) : (
                <span>{text}</span>
            )}
        </div>
    );
}
