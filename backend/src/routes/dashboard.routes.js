import express from 'express';
import { pool } from '../db/pool.js';
import { httpError, parseId } from '../utils/http.js';

function excelXmlValue(value) {
    if (value === null || value === undefined) return '';
    return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function excelWorksheet(name, columns, rows) {
    const header = columns.map((column) => `<Cell><Data ss:Type="String">${excelXmlValue(column)}</Data></Cell>`).join('');
    const body = rows.map((row) => `<Row>${columns.map((column) => {
        const value = row[column];
        const type = typeof value === 'number' ? 'Number' : 'String';
        return `<Cell><Data ss:Type="${type}">${excelXmlValue(value)}</Data></Cell>`;
    }).join('')}</Row>`).join('');
    return `<Worksheet ss:Name="${excelXmlValue(name)}"><Table><Row>${header}</Row>${body}</Table></Worksheet>`;
}

const router = express.Router();

router.get('/dashboard', async (req, res) => {
    const from = req.query.from ? new Date(String(req.query.from)) : null;
    const to = req.query.to ? new Date(String(req.query.to)) : null;
    if ((from && Number.isNaN(from.getTime())) || (to && Number.isNaN(to.getTime()))) {
        throw httpError(400, 'Khoảng ngày báo cáo không hợp lệ.');
    }

    const applicationFilters = [];
    const applicationValues = [];
    if (from) {
        applicationFilters.push('a.applied_at >= ?');
        applicationValues.push(from.toISOString().slice(0, 10) + ' 00:00:00');
    }
    if (to) {
        applicationFilters.push('a.applied_at <= ?');
        applicationValues.push(to.toISOString().slice(0, 10) + ' 23:59:59');
    }
    if (req.query.jobId) {
        applicationFilters.push('a.job_id = ?');
        applicationValues.push(parseId(req.query.jobId, 'Job ID'));
    }
    const applicationWhere = applicationFilters.length ? `WHERE ${applicationFilters.join(' AND ')}` : '';

    const [[jobs]] = await pool.query("SELECT COUNT(*) AS total, SUM(status = 'opening') AS open FROM jobs");
    const [[candidates]] = await pool.query('SELECT COUNT(*) AS total FROM candidates');
    const [pipeline] = await pool.query(
        `SELECT a.status, COUNT(*) AS total FROM applications a ${applicationWhere} GROUP BY a.status`,
        applicationValues
    );
    const [[outcomes]] = await pool.query(
        `SELECT SUM(a.status = 'hired') AS hired, SUM(a.status = 'rejected') AS rejected,
                ROUND(AVG(CASE WHEN a.status = 'hired' THEN DATEDIFF(NOW(), a.applied_at) END), 1) AS avg_days_to_hire,
                ROUND(SUM(a.status = 'hired') * 100 / NULLIF(COUNT(*), 0), 1) AS hire_rate
         FROM applications a ${applicationWhere}`,
        applicationValues
    );
    const [topJobs] = await pool.query(
        `SELECT j.id, j.title, COUNT(a.id) AS applications, COALESCE(SUM(a.status = 'hired'), 0) AS hires,
                ROUND(COALESCE(SUM(a.status = 'hired'), 0) * 100 / NULLIF(COUNT(a.id), 0), 1) AS hire_rate
         FROM jobs j LEFT JOIN applications a ON a.job_id = j.id
         GROUP BY j.id ORDER BY applications DESC LIMIT 8`
    );
    const [byDepartment] = await pool.query(
        `SELECT COALESCE(NULLIF(TRIM(j.department), ''), 'Không phân loại') AS department,
                COUNT(a.id) AS applications, SUM(a.status = 'hired') AS hired
         FROM jobs j LEFT JOIN applications a ON a.job_id = j.id
         GROUP BY COALESCE(NULLIF(TRIM(j.department), ''), 'Không phân loại')
         ORDER BY applications DESC`
    );
    const [trend] = await pool.query(
        `SELECT DATE_FORMAT(a.applied_at, '%Y-%m') AS month, COUNT(*) AS applications
         FROM applications a
         WHERE a.applied_at IS NOT NULL
           AND DATE(a.applied_at) >= DATE_FORMAT(DATE_SUB(CURDATE(), INTERVAL 11 MONTH), '%Y-%m-01')
         GROUP BY DATE_FORMAT(a.applied_at, '%Y-%m') ORDER BY month`
    );
    const [[interviews]] = await pool.query(
        `SELECT COUNT(*) AS total,
                SUM(i.status = 'scheduled' AND i.interview_date >= NOW()) AS scheduled,
                SUM(i.status = 'completed') AS completed,
                SUM(i.status = 'cancelled') AS cancelled
         FROM interviews i JOIN applications a ON a.id = i.application_id ${applicationWhere ? applicationWhere.replaceAll('a.applied_at', 'a.applied_at') : ''}`,
        applicationValues
    );
    const [upcomingInterviews] = await pool.query(
        `SELECT i.id, i.interview_date, i.status, c.full_name AS candidate_name, j.title AS job_title
         FROM interviews i JOIN applications a ON a.id = i.application_id
         JOIN candidates c ON c.id = a.candidate_id JOIN jobs j ON j.id = a.job_id
         WHERE i.status = 'scheduled' AND i.interview_date >= NOW()
         ORDER BY i.interview_date ASC LIMIT 10`
    );

    const byStatus = Object.fromEntries(pipeline.map((row) => [row.status, Number(row.total)]));
    const totalApplications = Object.values(byStatus).reduce((sum, count) => sum + count, 0);
    const interviewTotal = Number(interviews.total || 0);
    const completed = Number(interviews.completed || 0);
    res.json({ data: {
        jobs: { total: Number(jobs.total || 0), open: Number(jobs.open || 0) },
        candidates: { total: Number(candidates.total || 0) },
        applications: {
            total: totalApplications,
            byStatus,
            hired: Number(outcomes.hired || 0),
            rejected: Number(outcomes.rejected || 0),
            hireRate: Number(outcomes.hire_rate || 0),
            averageDaysToHire: outcomes.avg_days_to_hire === null ? null : Number(outcomes.avg_days_to_hire)
        },
        interviews: {
            total: interviewTotal,
            scheduled: Number(interviews.scheduled || 0),
            completed,
            cancelled: Number(interviews.cancelled || 0),
            completionRate: interviewTotal ? Number(((completed * 100) / interviewTotal).toFixed(1)) : 0
        },
        trend: trend.map((row) => ({ month: row.month, applications: Number(row.applications) })),
        byDepartment: byDepartment.map((row) => ({ department: row.department, applications: Number(row.applications || 0), hired: Number(row.hired || 0) })),
        topJobs: topJobs.map((row) => ({ ...row, applications: Number(row.applications), hires: Number(row.hires || 0), hire_rate: Number(row.hire_rate || 0) })),
        upcomingInterviews
    }});
});

router.get('/export/full', async (req, res) => {
    const [jobs] = await pool.query(
        `SELECT j.id AS 'Mã tin', j.title AS 'Vị trí', COALESCE(j.department, '') AS 'Phòng ban',
                j.description AS 'Mô tả', COALESCE(j.salary, '') AS 'Mức lương', j.status AS 'Trạng thái',
                u.name AS 'Người tạo', u.email AS 'Email người tạo', j.created_at AS 'Ngày tạo',
                COUNT(a.id) AS 'Số hồ sơ'
         FROM jobs j LEFT JOIN users u ON u.id = j.created_by
         LEFT JOIN applications a ON a.job_id = j.id
         GROUP BY j.id, j.title, j.department, j.description, j.salary, j.status, u.name, u.email, j.created_at
         ORDER BY j.created_at DESC`
    );
    const [candidates] = await pool.query(
        `SELECT c.id AS 'Mã ứng viên', c.full_name AS 'Họ và tên', c.email AS 'Email',
                COALESCE(c.phone, '') AS 'Số điện thoại', c.created_at AS 'Ngày tham gia',
                COUNT(DISTINCT a.id) AS 'Số hồ sơ ứng tuyển',
                COUNT(DISTINCT CASE WHEN a.status = 'hired' THEN a.id END) AS 'Số lần trúng tuyển',
                COUNT(DISTINCT CASE WHEN a.status = 'rejected' THEN a.id END) AS 'Số lần từ chối'
         FROM candidates c LEFT JOIN applications a ON a.candidate_id = c.id
         GROUP BY c.id, c.full_name, c.email, c.phone, c.created_at ORDER BY c.created_at DESC`
    );
    const [applications] = await pool.query(
        `SELECT a.id AS 'Mã hồ sơ', c.id AS 'Mã ứng viên', c.full_name AS 'Ứng viên',
                c.email AS 'Email ứng viên', COALESCE(c.phone, '') AS 'Số điện thoại',
                j.id AS 'Mã tin', j.title AS 'Vị trí ứng tuyển', COALESCE(j.department, '') AS 'Phòng ban',
                a.status AS 'Trạng thái', a.cv_file_url AS 'Đường dẫn CV', a.applied_at AS 'Ngày ứng tuyển',
                COALESCE(e.match_score, '') AS 'Điểm AI', COALESCE(e.pros, '') AS 'Điểm nổi bật',
                COALESCE(e.cons, '') AS 'Điểm cần lưu ý', COALESCE(e.suggested_questions, '') AS 'Câu hỏi gợi ý',
                COALESCE(a.outcome_reason, '') AS 'Lý do kết quả', COALESCE(a.outcome_notes, '') AS 'Ghi chú kết quả',
                a.decision_at AS 'Thời điểm quyết định'
         FROM applications a JOIN candidates c ON c.id = a.candidate_id
         JOIN jobs j ON j.id = a.job_id LEFT JOIN ai_evaluations e ON e.application_id = a.id
         ORDER BY a.applied_at DESC`
    );
    const [evaluations] = await pool.query(
        `SELECT e.application_id AS 'Mã hồ sơ', c.full_name AS 'Ứng viên', j.title AS 'Vị trí',
                e.match_score AS 'Điểm AI', COALESCE(e.pros, '') AS 'Điểm nổi bật',
                COALESCE(e.cons, '') AS 'Điểm cần lưu ý', COALESCE(e.suggested_questions, '') AS 'Câu hỏi gợi ý',
                e.evaluated_at AS 'Ngày đánh giá'
         FROM ai_evaluations e JOIN applications a ON a.id = e.application_id
         JOIN candidates c ON c.id = a.candidate_id JOIN jobs j ON j.id = a.job_id
         ORDER BY e.evaluated_at DESC`
    );
    const [interviews] = await pool.query(
        `SELECT i.id AS 'Mã lịch', i.application_id AS 'Mã hồ sơ', c.full_name AS 'Ứng viên',
                j.title AS 'Vị trí', u.name AS 'Người phỏng vấn', i.interview_date AS 'Thời gian',
                COALESCE(i.location_or_link, '') AS 'Địa điểm hoặc liên kết', i.status AS 'Trạng thái',
                i.confirmation_status AS 'Xác nhận ứng viên', COALESCE(i.notes, '') AS 'Ghi chú',
                i.reminder_sent_at AS 'Thời điểm gửi nhắc nhở', i.created_at AS 'Ngày tạo lịch'
         FROM interviews i JOIN applications a ON a.id = i.application_id
         JOIN candidates c ON c.id = a.candidate_id JOIN jobs j ON j.id = a.job_id
         LEFT JOIN users u ON u.id = i.interviewer_id ORDER BY i.interview_date DESC`
    );
    const [team] = await pool.query(
        `SELECT id AS 'Mã nhân sự', name AS 'Họ và tên', email AS 'Email', role AS 'Vai trò',
                created_at AS 'Ngày tạo'
         FROM users ORDER BY created_at DESC`
    );
    const [departments] = await pool.query(
        `SELECT COALESCE(NULLIF(TRIM(j.department), ''), 'Không phân loại') AS 'Phòng ban',
                COUNT(DISTINCT j.id) AS 'Số tin tuyển dụng', COUNT(a.id) AS 'Số hồ sơ',
                SUM(a.status = 'hired') AS 'Đã tuyển', SUM(a.status = 'rejected') AS 'Từ chối',
                SUM(a.status = 'interview') AS 'Đang phỏng vấn'
         FROM jobs j LEFT JOIN applications a ON a.job_id = j.id
         GROUP BY COALESCE(NULLIF(TRIM(j.department), ''), 'Không phân loại')
         ORDER BY COUNT(a.id) DESC`
    );
    const [summary] = await pool.query(
        `SELECT 'Tin tuyển dụng' AS 'Nhóm', COUNT(*) AS 'Tổng số' FROM jobs
         UNION ALL SELECT 'Ứng viên', COUNT(*) FROM candidates
         UNION ALL SELECT 'Hồ sơ ứng tuyển', COUNT(*) FROM applications
         UNION ALL SELECT 'Lịch phỏng vấn', COUNT(*) FROM interviews
         UNION ALL SELECT 'Nhân sự', COUNT(*) FROM users`
    );

    const sheets = [
        excelWorksheet('Tổng quan', ['Nhóm', 'Tổng số'], summary),
        excelWorksheet('Tin tuyển dụng', Object.keys(jobs[0] || { 'Mã tin': '', 'Vị trí': '' }), jobs),
        excelWorksheet('Ứng viên', Object.keys(candidates[0] || { 'Mã ứng viên': '', 'Họ và tên': '' }), candidates),
        excelWorksheet('Hồ sơ ứng tuyển', Object.keys(applications[0] || { 'Mã hồ sơ': '', 'Ứng viên': '' }), applications),
        excelWorksheet('Đánh giá AI', Object.keys(evaluations[0] || { 'Mã hồ sơ': '', 'Ứng viên': '' }), evaluations),
        excelWorksheet('Phỏng vấn', Object.keys(interviews[0] || { 'Mã lịch': '', 'Ứng viên': '' }), interviews),
        excelWorksheet('Đội ngũ', Object.keys(team[0] || { 'Mã nhân sự': '', 'Họ và tên': '' }), team),
        excelWorksheet('Theo phòng ban', Object.keys(departments[0] || { 'Phòng ban': '', 'Số hồ sơ': 0 }), departments)
    ];
    const xml = `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">${sheets.join('')}</Workbook>`;
    res.setHeader('Content-Type', 'application/vnd.ms-excel;charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="bao-cao-tuyen-dung-${new Date().toISOString().slice(0, 10)}.xls"`);
    res.send(xml);
});

export default router;
