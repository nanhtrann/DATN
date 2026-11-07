import { pool } from '../src/db/pool.js';

const jobs = [
  ['Frontend Developer', 'Engineering', 'Xây dựng giao diện web responsive bằng React và TypeScript.', '20 - 30 triệu'],
  ['Backend Developer', 'Engineering', 'Phát triển API bảo mật bằng Node.js và MySQL.', '22 - 35 triệu'],
  ['Business Analyst', 'Product', 'Phân tích yêu cầu, đặc tả nghiệp vụ và phối hợp nhóm phát triển.', '18 - 28 triệu'],
  ['Product Designer', 'Design', 'Thiết kế trải nghiệm người dùng và hệ thống thiết kế sản phẩm.', '18 - 27 triệu'],
  ['Data Analyst', 'Data', 'Phân tích dữ liệu kinh doanh, xây dựng dashboard và báo cáo.', '20 - 32 triệu'],
  ['DevOps Engineer', 'Engineering', 'Quản trị CI/CD, cloud infrastructure và hệ thống giám sát.', '25 - 40 triệu'],
  ['QA Engineer', 'Quality Assurance', 'Thiết kế test case, kiểm thử API và tự động hóa kiểm thử.', '15 - 25 triệu'],
  ['Mobile Developer', 'Engineering', 'Phát triển ứng dụng Android/iOS bằng React Native.', '22 - 34 triệu'],
  ['Marketing Executive', 'Marketing', 'Lập kế hoạch chiến dịch và đo lường hiệu quả truyền thông.', '12 - 18 triệu'],
  ['HR Executive', 'Human Resources', 'Tuyển dụng, onboarding và quản lý hoạt động nhân sự.', '14 - 22 triệu'],
  ['Accountant', 'Finance', 'Theo dõi sổ sách, báo cáo thuế và báo cáo tài chính.', '15 - 24 triệu'],
  ['Sales Executive', 'Sales', 'Tìm kiếm khách hàng, chăm sóc tài khoản và đạt doanh số.', '12 - 25 triệu'],
  ['Customer Support', 'Customer Success', 'Hỗ trợ khách hàng qua email, chat và điện thoại.', '10 - 16 triệu'],
  ['IT Support', 'Information Technology', 'Hỗ trợ máy tính, mạng nội bộ và tài khoản người dùng.', '12 - 20 triệu'],
  ['Project Manager', 'Product', 'Lập kế hoạch dự án, quản lý tiến độ, rủi ro và giao tiếp stakeholder.', '25 - 38 triệu']
];

const candidates = [
  ['Nguyen Minh An', 'sample.candidate01@hrassistant.local', '0901000001'],
  ['Tran Thu Binh', 'sample.candidate02@hrassistant.local', '0901000002'],
  ['Le Hoang Chi', 'sample.candidate03@hrassistant.local', '0901000003'],
  ['Pham Gia Dung', 'sample.candidate04@hrassistant.local', '0901000004'],
  ['Vo Quoc Dat', 'sample.candidate05@hrassistant.local', '0901000005'],
  ['Hoang Kim Giang', 'sample.candidate06@hrassistant.local', '0901000006'],
  ['Bui Ngoc Han', 'sample.candidate07@hrassistant.local', '0901000007'],
  ['Dang Thanh Khoa', 'sample.candidate08@hrassistant.local', '0901000008'],
  ['Do Phuong Linh', 'sample.candidate09@hrassistant.local', '0901000009'],
  ['Nguyen Bao Long', 'sample.candidate10@hrassistant.local', '0901000010'],
  ['Vu Minh My', 'sample.candidate11@hrassistant.local', '0901000011'],
  ['Phan Thien Nam', 'sample.candidate12@hrassistant.local', '0901000012'],
  ['Cao Hanh Phuc', 'sample.candidate13@hrassistant.local', '0901000013'],
  ['Mai Quynh Anh', 'sample.candidate14@hrassistant.local', '0901000014'],
  ['Duong Viet Tuan', 'sample.candidate15@hrassistant.local', '0901000015']
];

const statuses = ['new', 'screening', 'interview', 'interview', 'screening', 'new',
  'hired', 'rejected', 'interview', 'new', 'screening', 'interview', 'hired',
  'rejected', 'screening'];

const interviewStatuses = ['scheduled', 'scheduled', 'completed', 'completed', 'scheduled',
  'completed', 'completed', 'scheduled', 'scheduled', 'completed', 'scheduled',
  'completed', 'scheduled', 'completed', 'scheduled'];

function sampleJobTitle(title) {
  return `[Sample] ${title}`;
}

async function seed() {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const [[admin]] = await connection.query(
      'SELECT id FROM users WHERE role = ? ORDER BY id LIMIT 1',
      ['admin']
    );
    if (!admin) throw new Error('Can database needs at least one admin user before seeding.');

    const jobIds = [];
    for (const [title, department, description, salary] of jobs) {
      const sampleTitle = sampleJobTitle(title);
      const [existing] = await connection.execute(
        'SELECT id FROM jobs WHERE title = ? LIMIT 1',
        [sampleTitle]
      );
      if (existing.length) {
        jobIds.push(existing[0].id);
      } else {
        const [result] = await connection.execute(
          'INSERT INTO jobs (title, department, description, salary, status, created_by) VALUES (?, ?, ?, ?, ?, ?)',
          [sampleTitle, department, description, salary, 'opening', admin.id]
        );
        jobIds.push(result.insertId);
      }
    }

    const candidateIds = [];
    for (const [name, email, phone] of candidates) {
      const [existing] = await connection.execute(
        'SELECT id FROM candidates WHERE email = ? LIMIT 1',
        [email]
      );
      if (existing.length) {
        candidateIds.push(existing[0].id);
      } else {
        const [result] = await connection.execute(
          'INSERT INTO candidates (full_name, email, phone) VALUES (?, ?, ?)',
          [name, email, phone]
        );
        candidateIds.push(result.insertId);
      }
    }

    const applicationIds = [];
    for (let index = 0; index < candidates.length; index += 1) {
      const jobId = jobIds[index];
      const candidateId = candidateIds[index];
      const [existing] = await connection.execute(
        'SELECT id FROM applications WHERE job_id = ? AND candidate_id = ? LIMIT 1',
        [jobId, candidateId]
      );
      if (existing.length) {
        applicationIds.push(existing[0].id);
      } else {
        const [result] = await connection.execute(
          'INSERT INTO applications (job_id, candidate_id, cv_file_url, status) VALUES (?, ?, ?, ?)',
          [jobId, candidateId, 'uploads/sample_cv.pdf', statuses[index]]
        );
        applicationIds.push(result.insertId);
      }
    }

    const scores = [92, 88, 95, 84, 79, 91, 86, 76, 89, 93, 81, 87, 94, 78, 90];
    for (let index = 0; index < applicationIds.length; index += 1) {
      const applicationId = applicationIds[index];
      const [existing] = await connection.execute(
        'SELECT id FROM ai_evaluations WHERE application_id = ? LIMIT 1',
        [applicationId]
      );
      const pros = JSON.stringify([
        'Đáp ứng tốt yêu cầu chuyên môn của vị trí.',
        'Có kinh nghiệm làm việc phù hợp với mô hình sản phẩm.'
      ]);
      const cons = JSON.stringify([
        'Cần đánh giá sâu hơn trong vòng phỏng vấn kỹ thuật.',
        'Kinh nghiệm quản lý dự án còn cần được xác minh.'
      ]);
      const questions = JSON.stringify([
        'Hãy mô tả một dự án khó nhất bạn đã thực hiện.',
        'Bạn sẽ xử lý thế nào khi tiến độ dự án bị trễ?'
      ]);
      if (!existing.length) {
        await connection.execute(
          `INSERT INTO ai_evaluations
            (application_id, match_score, pros, cons, suggested_questions)
           VALUES (?, ?, ?, ?, ?)`,
          [applicationId, scores[index], pros, cons, questions]
        );
      }
    }

    for (let index = 0; index < applicationIds.length; index += 1) {
      const applicationId = applicationIds[index];
      const [application] = await connection.execute(
        "SELECT status FROM applications WHERE id = ?",
        [applicationId]
      );
      if (!['interview', 'screening'].includes(application[0]?.status)) continue;

      const [existing] = await connection.execute(
        'SELECT id FROM interviews WHERE application_id = ? LIMIT 1',
        [applicationId]
      );
      if (existing.length) continue;

      const interviewDate = new Date();
      interviewDate.setUTCDate(interviewDate.getUTCDate() + index + 1);
      interviewDate.setUTCHours(9, index * 3, 0, 0);
      await connection.execute(
        `INSERT INTO interviews
          (application_id, interviewer_id, interview_date, location_or_link, status, confirmation_status, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          applicationId,
          admin.id,
          interviewDate.toISOString().slice(0, 19).replace('T', ' '),
          index % 2 === 0 ? 'Phòng họp Orion - Tầng 5' : 'https://meet.example.com/sample-interview',
          interviewStatuses[index],
          index % 3 === 0 ? 'confirmed' : 'pending',
          'Dữ liệu mẫu - lịch phỏng vấn demo.'
        ]
      );
    }

    await connection.commit();
    console.log('Đã seed 15 tin tuyển dụng, 15 ứng viên, 15 hồ sơ và dữ liệu đánh giá/liên quan.');
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
    await pool.end();
  }
}

seed().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
