import { X } from 'lucide-react';

export default function Modal({ title, description, onClose, children, wide = false }) {
    return (
        <div className="modal-backdrop" onMouseDown={(event) => {
            if (event.target === event.currentTarget) onClose();
        }}>
            <section className={`modal-card${wide ? ' modal-wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
                <header className="modal-header">
                    <div>
                        <h2>{title}</h2>
                        {description && <p>{description}</p>}
                    </div>
                    <button className="icon-button" onClick={onClose} aria-label="Đóng">
                        <X size={19} />
                    </button>
                </header>
                {children}
            </section>
        </div>
    );
}
