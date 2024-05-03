import { useState } from 'react';
import MaterialIcon from './material_icon';

interface CopyUrlProps {
    url: string;
    text: string;
    linkTitle: boolean;
    disabled: boolean;
}

export default function CopyUrl({
    url,
    text,
    linkTitle,
    disabled,
}: CopyUrlProps) {
    const [copied, setCopied] = useState(false);

    return (
        <div
            className={`flex flex-row items-center py-2 ${disabled ? 'text-gray-400' : 'cursor-pointer text-blue-500'}`}
            onClick={
                linkTitle || disabled
                    ? undefined
                    : async () => {
                          const host =
                              window.location.protocol +
                              '//' +
                              window.location.host;
                          const copy_url = `${host}${url}zarr/`;
                          const _ = await window.navigator.clipboard.writeText(
                              `${copy_url}`,
                          );
                          setCopied(true);
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
                              const copy_url = `${host}${url}zarr/`;
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
