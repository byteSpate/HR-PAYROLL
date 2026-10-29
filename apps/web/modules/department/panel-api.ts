import { createDepartment as create, deleteDepartment as remove, listDepartments as list, renameDepartment } from './api';

// The settings panel copied from HR-MNG-V1 threads an access token through every call. The shared
// client already attaches it, so these keep HR's signatures and ignore the first argument.
export const listDepartments = (_accessToken: string) => list();
export const createDepartment = (_accessToken: string, input: { name: string }) => create(input.name);
export const updateDepartment = (_accessToken: string, id: string, input: { name: string }) => renameDepartment(id, input.name);
export const deleteDepartment = (_accessToken: string, id: string) => remove(id);
