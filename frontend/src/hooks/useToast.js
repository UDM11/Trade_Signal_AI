import { useState, useCallback } from 'react';

export function useToast() {
    const [toasts, setToasts] = useState([]);

    const add = useCallback(({ title, message, type = 'success', duration = 4000 }) => {
        const id = Date.now();
        setToasts(prev => [...prev, { id, title, message, type }]);
        setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), duration);
    }, []);

    const remove = useCallback((id) => setToasts(prev => prev.filter(t => t.id !== id)), []);

    return { toasts, add, remove };
}
