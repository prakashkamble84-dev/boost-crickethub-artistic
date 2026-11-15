export default {
  select: ({ record, user }) => {
    if (!user) return record.is_published_c === true;
    if (user.profile === 'Admin_c') return true;
    if (user.profile === 'Organizer_c') {
      return String(record.Owner?.Id ?? record.Owner) === String(user.Id);
    }
    return false;
  },
  insert: ({ record, user }) => {
    if (!user) return false;
    if (!['Admin_c', 'Organizer_c'].includes(user.profile)) return false;
    return String(record.Owner?.Id ?? record.Owner) === String(user.Id);
  },
  update: ({ record, user }) => {
    if (!user) return false;
    if (user.profile === 'Admin_c') return true;
    if (user.profile === 'Organizer_c') {
      return String(record.Owner?.Id ?? record.Owner) === String(user.Id);
    }
    return false;
  },
  remove: ({ record, user }) => {
    if (!user) return false;
    if (user.profile === 'Admin_c') return true;
    if (user.profile === 'Organizer_c') {
      return String(record.Owner?.Id ?? record.Owner) === String(user.Id);
    }
    return false;
  }
};
