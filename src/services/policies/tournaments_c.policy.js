const signedIn = (user) => Boolean(user?.Id);

export const select = (record, user) => signedIn(user);
export const insert = (record, user) => signedIn(user);
export const update = (record, user) => signedIn(user);
export const remove = (record, user) => signedIn(user);
