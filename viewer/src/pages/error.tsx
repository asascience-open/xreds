import { useRouteError } from 'react-router-dom';

export default function ErrorPage() {
    const { error } = useRouteError();
    console.error(error);

    return (
        <div>
            <h1>Error</h1>
            <p>Something went wrong.</p>
            <p>
                <i>{error}</i>
            </p>
        </div>
    );
}
