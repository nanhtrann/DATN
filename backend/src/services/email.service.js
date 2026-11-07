import nodemailer from 'nodemailer';
import { config } from '../config/env.js';
import { httpError } from '../utils/http.js';

export async function sendEmail({ to, subject, text, html }) {
    if (!config.smtp.host || !config.smtp.user || !config.smtp.password) {
        throw httpError(503, 'Chưa cấu hình SMTP_HOST, SMTP_USER và SMTP_PASSWORD.');
    }
    const transporter = nodemailer.createTransport({
        host: config.smtp.host,
        port: config.smtp.port,
        secure: config.smtp.secure,
        auth: { user: config.smtp.user, pass: config.smtp.password }
    });
    return transporter.sendMail({
        from: config.smtp.from,
        to,
        subject,
        text,
        html
    });
}

function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>'"]/g, (character) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
    })[character]);
}

function layout({ greeting, title, body, accent = '#2563eb' }) {
    return `<!doctype html><html><body style="margin:0;background:#f5f7fb;font-family:Arial,sans-serif;color:#172033">
    <div style="max-width:620px;margin:24px auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e7eaf0">
      <div style="padding:22px 28px;background:${accent};color:#fff"><b style="font-size:20px">HRauto</b></div>
      <div style="padding:28px">
        <p>${escapeHtml(greeting)}</p><h1 style="font-size:22px;margin-top:0">${escapeHtml(title)}</h1>
        ${body}<p style="margin-top:28px">Trân trọng,<br><b>Đội ngũ tuyển dụng HRauto</b></p>
      </div>
    </div></body></html>`;
}

export function interviewInvitationTemplate({ candidateName, jobTitle, interviewDate, locationOrLink }) {
    const dateText = interviewDate.toLocaleString('vi-VN', { dateStyle: 'full', timeStyle: 'short', timeZone: config.appTimeZone });
    const location = locationOrLink || 'Thông tin địa điểm sẽ được thông báo lại';
    const subject = `[HRauto] Lịch phỏng vấn vị trí ${jobTitle}`;
    const text = `Chào ${candidateName},\n\nHRauto mời bạn tham gia phỏng vấn vị trí ${jobTitle}.\nThời gian: ${dateText}\nĐịa điểm/liên kết: ${location}\n\nVui lòng xác nhận lịch hẹn hoặc phản hồi nếu bạn cần thay đổi.\n\nTrân trọng,\nĐội ngũ tuyển dụng HRauto`;
    const html = layout({
        greeting: `Chào ${escapeHtml(candidateName)},`,
        title: `Lịch phỏng vấn — ${escapeHtml(jobTitle)}`,
        body: `<p>HRauto trân trọng mời bạn tham gia buổi phỏng vấn.</p>
          <table style="width:100%;border-collapse:collapse"><tr><td style="padding:10px;border-bottom:1px solid #edf0f5"><b>Thời gian</b></td><td style="padding:10px;border-bottom:1px solid #edf0f5">${escapeHtml(dateText)}</td></tr>
          <tr><td style="padding:10px;border-bottom:1px solid #edf0f5"><b>Địa điểm/liên kết</b></td><td style="padding:10px;border-bottom:1px solid #edf0f5">${escapeHtml(location)}</td></tr></table>
          <p>Vui lòng xác nhận lịch hẹn hoặc phản hồi nếu bạn cần thay đổi.</p>`
    });
    return { subject, text, html };
}

export function applicationOutcomeTemplate({ candidateName, jobTitle, hired }) {
    const passed = Boolean(hired);
    const subject = passed ? `[HRauto] Chúc mừng bạn đã trúng tuyển — ${jobTitle}` : `[HRauto] Kết quả ứng tuyển vị trí ${jobTitle}`;
    const text = passed
        ? `Chào ${candidateName},\n\nXin chúc mừng! Hồ sơ của bạn đã được chấp nhận cho vị trí ${jobTitle}. HRauto sẽ liên hệ để trao đổi các bước tiếp theo.\n\nTrân trọng,\nĐội ngũ tuyển dụng HRauto`
        : `Chào ${candidateName},\n\nCảm ơn bạn đã quan tâm và ứng tuyển vị trí ${jobTitle}. Sau quá trình xem xét, chúng tôi rất tiếc chưa thể tiếp tục với hồ sơ của bạn trong đợt tuyển dụng này. Chúng tôi mong được gặp lại bạn ở cơ hội phù hợp sau này.\n\nTrân trọng,\nĐội ngũ tuyển dụng HRauto`;
    const html = layout({
        accent: passed ? '#15803d' : '#475569',
        greeting: `Chào ${escapeHtml(candidateName)},`,
        title: passed ? 'Chúc mừng bạn đã trúng tuyển!' : 'Thông báo kết quả ứng tuyển',
        body: passed
            ? `<p>Hồ sơ của bạn đã được chấp nhận cho vị trí <b>${escapeHtml(jobTitle)}</b>. HRauto sẽ liên hệ để trao đổi các bước tiếp theo.</p>`
            : `<p>Cảm ơn bạn đã quan tâm và ứng tuyển vị trí <b>${escapeHtml(jobTitle)}</b>.</p><p>Sau quá trình xem xét, chúng tôi rất tiếc chưa thể tiếp tục với hồ sơ của bạn trong đợt tuyển dụng này. Chúng tôi mong được gặp lại bạn ở cơ hội phù hợp sau này.</p>`
    });
    return { subject, text, html };
}

export function offerTemplate({ candidateName, jobTitle, salary, startDate, details }) {
    const subject = `[HRauto] Thư mời nhận việc — ${jobTitle}`;
    const salaryText = salary || 'Theo thỏa thuận';
    const startDateText = startDate
        ? new Date(`${startDate}T00:00:00`).toLocaleDateString('vi-VN', { dateStyle: 'full', timeZone: config.appTimeZone })
        : 'Sẽ được thống nhất sau';
    const detailsText = details ? `\nGhi chú: ${details}\n` : '';
    const text = `Chào ${candidateName},\n\nHRauto trân trọng gửi thư mời bạn nhận việc tại vị trí ${jobTitle}.\nMức lương/đãi ngộ: ${salaryText}\nNgày bắt đầu dự kiến: ${startDateText}${detailsText}\n\nVui lòng phản hồi thư này để xác nhận đồng ý hoặc trao đổi thêm.\n\nTrân trọng,\nĐội ngũ tuyển dụng HRauto`;
    const html = layout({
        accent: '#15803d',
        greeting: `Chào ${escapeHtml(candidateName)},`,
        title: `Thư mời nhận việc — ${escapeHtml(jobTitle)}`,
        body: `<p>HRauto trân trọng gửi thư mời bạn nhận việc tại vị trí <b>${escapeHtml(jobTitle)}</b>.</p>
          <table style="width:100%;border-collapse:collapse">
            <tr><td style="padding:10px;border-bottom:1px solid #edf0f5"><b>Mức lương/đãi ngộ</b></td><td style="padding:10px;border-bottom:1px solid #edf0f5">${escapeHtml(salaryText)}</td></tr>
            <tr><td style="padding:10px;border-bottom:1px solid #edf0f5"><b>Ngày bắt đầu dự kiến</b></td><td style="padding:10px;border-bottom:1px solid #edf0f5">${escapeHtml(startDateText)}</td></tr>
          </table>
          ${details ? `<p><b>Thông tin bổ sung:</b><br>${escapeHtml(details).replace(/\n/g, '<br>')}</p>` : ''}
          <p>Vui lòng phản hồi thư này để xác nhận đồng ý hoặc trao đổi thêm.</p>`
    });
    return { subject, text, html };
}
