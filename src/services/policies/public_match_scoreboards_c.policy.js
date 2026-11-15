export const select = (record, user) => {
  if (!user) return record.is_published_c === true;
  if (user.profile === 'Admin_c') return true;
  if (user.profile === 'Organizer_c') {
    return String(record.Owner?.Id ?? record.Owner) === String(user.Id);
  }
  return false;
};

export const insert = (record, user) => {
  if (!user) return false;
  if (!['Admin_c', 'Organizer_c'].includes(user.profile)) return false;
  return String(record.Owner?.Id ?? record.Owner) === String(user.Id);
};

export const update = (record, user) => {
  if (!user) return false;
  if (user.profile === 'Admin_c') return true;
  if (user.profile === 'Organizer_c') {
    return String(record.Owner?.Id ?? record.Owner) === String(user.Id);
  }
  return false;
};

export const remove = (record, user) => {
  if (!user) return false;
  if (user.profile === 'Admin_c') return true;
  if (user.profile === 'Organizer_c') {
    return String(record.Owner?.Id ?? record.Owner) === String(user.Id);
  }
  return false;
};
