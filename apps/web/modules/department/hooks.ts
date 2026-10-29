'use client';

import { useQuery } from '@tanstack/react-query';
import * as api from './api';

export const useDepartments = () => useQuery({ queryKey: ['departments'], queryFn: api.listDepartments });
