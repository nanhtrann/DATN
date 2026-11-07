import { Inbox } from 'lucide-react';

export default function EmptyState({ title = 'Chưa có dữ liệu', description = 'Khi có thông tin mới, dữ liệu sẽ xuất hiện ở đây.' }) {
    return (
        <div className="empty-state">
            <span><Inbox size={23} /></span>
            <b>{title}</b>
            <p>{description}</p>
        </div>
    );
}
