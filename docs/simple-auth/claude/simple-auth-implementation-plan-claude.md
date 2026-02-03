# 간편인증 구현 계획 (Implementation Plan)

## 기술 스택

| 레이어 | 기술 | 아키텍처 |
|--------|------|----------|
| **Frontend** | TypeScript, ReactJS, RTK (Redux Toolkit), Axios | FSD (Feature Sliced Design) |
| **Backend** | TypeScript, NestJS, TypeORM, Axios | VSA (Vertical Sliced Architecture) |

---

## 1. Backend 구현 (NestJS + TypeORM)

### 1.1 모듈 구조 (VSA 기반)

```
src/
├── identity-verification/           # 본인인증 도메인
│   ├── identity-verification.module.ts
│   ├── identity-verification.controller.ts
│   ├── identity-verification.service.ts
│   ├── dto/
│   │   ├── request-verification.dto.ts
│   │   ├── verification-callback.dto.ts
│   │   └── verification-status.dto.ts
│   ├── entities/
│   │   └── identity-verification.entity.ts
│   ├── providers/
│   │   ├── auth-provider.interface.ts
│   │   ├── portone.provider.ts
│   │   └── barocert.provider.ts
│   └── constants/
│       └── verification-status.enum.ts
├── users/                           # 사용자 도메인
│   ├── users.module.ts
│   ├── users.service.ts
│   └── entities/
│       └── user.entity.ts
└── common/                          # 공통 모듈
    ├── crypto/
    │   └── encryption.service.ts
    └── config/
        └── auth-provider.config.ts
```

### 1.2 Entity 설계

#### identity-verification.entity.ts

```typescript
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';

export enum VerificationStatus {
  PENDING = 'PENDING',
  VERIFIED = 'VERIFIED',
  FAILED = 'FAILED',
  EXPIRED = 'EXPIRED',
}

export enum AuthProvider {
  PORTONE = 'PORTONE',
  BAROCERT = 'BAROCERT',
  INICIS = 'INICIS',
}

export enum AuthMethod {
  KAKAO = 'KAKAO',
  NAVER = 'NAVER',
  PASS = 'PASS',
  TOSS = 'TOSS',
  FINANCIAL = 'FINANCIAL',
}

@Entity('identity_verifications')
export class IdentityVerification {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 100, unique: true })
  verificationId: string;

  @Column({ type: 'enum', enum: VerificationStatus, default: VerificationStatus.PENDING })
  status: VerificationStatus;

  @Column({ type: 'enum', enum: AuthProvider })
  provider: AuthProvider;

  @Column({ type: 'enum', enum: AuthMethod, nullable: true })
  authMethod: AuthMethod;

  // 요청 정보
  @Column({ type: 'varchar', length: 50 })
  requestedName: string;

  @Column({ type: 'varchar', length: 20 })
  requestedPhone: string;

  @Column({ type: 'varchar', length: 8 })
  requestedBirthDate: string;

  // 인증 결과 (암호화 저장)
  @Column({ type: 'text', nullable: true })
  encryptedCi: string;

  @Column({ type: 'text', nullable: true })
  encryptedDi: string;

  @Column({ type: 'varchar', length: 64, nullable: true })
  ciHash: string; // 검색용 해시

  @Column({ type: 'varchar', length: 50, nullable: true })
  verifiedName: string;

  @Column({ type: 'varchar', length: 8, nullable: true })
  verifiedBirthDate: string;

  @Column({ type: 'varchar', length: 1, nullable: true })
  verifiedGender: string;

  // 관계
  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ name: 'user_id', nullable: true })
  userId: string;

  // 타임스탬프
  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  verifiedAt: Date;

  @Column({ type: 'timestamp' })
  expiresAt: Date;

  // 에러 정보
  @Column({ type: 'varchar', length: 500, nullable: true })
  failureReason: string;
}
```

#### user.entity.ts (CI/DI 관련 필드)

```typescript
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 100, unique: true, nullable: true })
  email: string;

  // 본인인증 정보 (암호화 저장)
  @Column({ type: 'text', nullable: true })
  encryptedCi: string;

  @Column({ type: 'varchar', length: 64, nullable: true, unique: true })
  ciHash: string; // CI 검색용 해시 (unique)

  @Column({ type: 'text', nullable: true })
  encryptedDi: string;

  // 인증된 개인정보
  @Column({ type: 'varchar', length: 50, nullable: true })
  verifiedName: string;

  @Column({ type: 'varchar', length: 8, nullable: true })
  verifiedBirthDate: string;

  @Column({ type: 'varchar', length: 20, nullable: true })
  verifiedPhone: string;

  @Column({ type: 'varchar', length: 1, nullable: true })
  verifiedGender: string;

  @Column({ type: 'boolean', default: false })
  isIdentityVerified: boolean;

  @Column({ type: 'timestamp', nullable: true })
  lastVerifiedAt: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
```

### 1.3 DTO 설계

#### request-verification.dto.ts

```typescript
import { IsString, IsNotEmpty, Length, Matches, IsEnum, IsOptional } from 'class-validator';
import { AuthMethod } from '../entities/identity-verification.entity';

export class RequestVerificationDto {
  @IsString()
  @IsNotEmpty()
  @Length(1, 50)
  name: string;

  @IsString()
  @IsNotEmpty()
  @Matches(/^01[0-9]{8,9}$/, { message: '유효한 휴대폰 번호를 입력해주세요' })
  phone: string;

  @IsString()
  @IsNotEmpty()
  @Matches(/^\d{8}$/, { message: '생년월일은 YYYYMMDD 형식이어야 합니다' })
  birthDate: string;

  @IsEnum(AuthMethod)
  @IsOptional()
  authMethod?: AuthMethod;

  @IsString()
  @IsOptional()
  returnUrl?: string;
}

export class RequestVerificationResponseDto {
  verificationId: string;
  authUrl?: string;
  deepLink?: string;
  expiresAt: Date;
}
```

#### verification-callback.dto.ts

```typescript
import { IsString, IsNotEmpty, IsOptional } from 'class-validator';

export class VerificationCallbackDto {
  @IsString()
  @IsNotEmpty()
  verificationId: string;

  @IsString()
  @IsOptional()
  resultCode?: string;

  @IsString()
  @IsOptional()
  resultMessage?: string;
}
```

#### verification-status.dto.ts

```typescript
import { VerificationStatus } from '../entities/identity-verification.entity';

export class VerificationStatusResponseDto {
  verificationId: string;
  status: VerificationStatus;
  verifiedName?: string;
  verifiedBirthDate?: string;
  verifiedGender?: string;
  ci?: string;
  di?: string;
  verifiedAt?: Date;
  failureReason?: string;
}
```

### 1.4 Service 구현

#### identity-verification.service.ts

```typescript
import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import {
  IdentityVerification,
  VerificationStatus,
  AuthProvider,
} from './entities/identity-verification.entity';
import { RequestVerificationDto, RequestVerificationResponseDto } from './dto/request-verification.dto';
import { VerificationStatusResponseDto } from './dto/verification-status.dto';
import { EncryptionService } from '../common/crypto/encryption.service';
import { AuthProviderInterface } from './providers/auth-provider.interface';
import { PortoneProvider } from './providers/portone.provider';

@Injectable()
export class IdentityVerificationService {
  private readonly VERIFICATION_TIMEOUT_MINUTES = 5;

  constructor(
    @InjectRepository(IdentityVerification)
    private readonly verificationRepository: Repository<IdentityVerification>,
    private readonly encryptionService: EncryptionService,
    private readonly portoneProvider: PortoneProvider,
  ) {}

  async requestVerification(
    dto: RequestVerificationDto,
    userId?: string,
  ): Promise<RequestVerificationResponseDto> {
    const verificationId = `iv_${uuidv4()}`;
    const expiresAt = new Date(Date.now() + this.VERIFICATION_TIMEOUT_MINUTES * 60 * 1000);

    // 인증 제공자에 요청
    const providerResponse = await this.portoneProvider.requestVerification({
      verificationId,
      name: dto.name,
      phone: dto.phone,
      birthDate: dto.birthDate,
      authMethod: dto.authMethod,
      returnUrl: dto.returnUrl,
    });

    // 인증 요청 저장
    const verification = this.verificationRepository.create({
      verificationId,
      status: VerificationStatus.PENDING,
      provider: AuthProvider.PORTONE,
      authMethod: dto.authMethod,
      requestedName: dto.name,
      requestedPhone: dto.phone,
      requestedBirthDate: dto.birthDate,
      userId,
      expiresAt,
    });

    await this.verificationRepository.save(verification);

    return {
      verificationId,
      authUrl: providerResponse.authUrl,
      deepLink: providerResponse.deepLink,
      expiresAt,
    };
  }

  async handleCallback(verificationId: string): Promise<void> {
    const verification = await this.findVerification(verificationId);

    if (verification.status !== VerificationStatus.PENDING) {
      throw new BadRequestException('이미 처리된 인증 요청입니다');
    }

    if (new Date() > verification.expiresAt) {
      verification.status = VerificationStatus.EXPIRED;
      await this.verificationRepository.save(verification);
      throw new BadRequestException('인증 시간이 만료되었습니다');
    }

    // 인증 결과 조회
    const result = await this.portoneProvider.getVerificationResult(verificationId);

    if (result.success) {
      // CI/DI 암호화
      const encryptedCi = await this.encryptionService.encrypt(result.ci);
      const encryptedDi = await this.encryptionService.encrypt(result.di);
      const ciHash = await this.encryptionService.hash(result.ci);

      verification.status = VerificationStatus.VERIFIED;
      verification.encryptedCi = encryptedCi;
      verification.encryptedDi = encryptedDi;
      verification.ciHash = ciHash;
      verification.verifiedName = result.name;
      verification.verifiedBirthDate = result.birthDate;
      verification.verifiedGender = result.gender;
      verification.verifiedAt = new Date();
    } else {
      verification.status = VerificationStatus.FAILED;
      verification.failureReason = result.errorMessage;
    }

    await this.verificationRepository.save(verification);
  }

  async getStatus(verificationId: string): Promise<VerificationStatusResponseDto> {
    const verification = await this.findVerification(verificationId);

    const response: VerificationStatusResponseDto = {
      verificationId: verification.verificationId,
      status: verification.status,
    };

    if (verification.status === VerificationStatus.VERIFIED) {
      response.verifiedName = verification.verifiedName;
      response.verifiedBirthDate = verification.verifiedBirthDate;
      response.verifiedGender = verification.verifiedGender;
      response.verifiedAt = verification.verifiedAt;

      // CI/DI는 필요 시 복호화하여 반환
      if (verification.encryptedCi) {
        response.ci = await this.encryptionService.decrypt(verification.encryptedCi);
      }
      if (verification.encryptedDi) {
        response.di = await this.encryptionService.decrypt(verification.encryptedDi);
      }
    }

    if (verification.status === VerificationStatus.FAILED) {
      response.failureReason = verification.failureReason;
    }

    return response;
  }

  async findUserByCi(ci: string): Promise<{ exists: boolean; userId?: string }> {
    const ciHash = await this.encryptionService.hash(ci);
    const verification = await this.verificationRepository.findOne({
      where: { ciHash, status: VerificationStatus.VERIFIED },
      relations: ['user'],
    });

    if (verification?.user) {
      return { exists: true, userId: verification.user.id };
    }

    return { exists: false };
  }

  private async findVerification(verificationId: string): Promise<IdentityVerification> {
    const verification = await this.verificationRepository.findOne({
      where: { verificationId },
    });

    if (!verification) {
      throw new NotFoundException('인증 요청을 찾을 수 없습니다');
    }

    return verification;
  }
}
```

### 1.5 Controller 구현

#### identity-verification.controller.ts

```typescript
import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Query,
  UseGuards,
  Req,
} from '@nestjs/common';
import { IdentityVerificationService } from './identity-verification.service';
import { RequestVerificationDto } from './dto/request-verification.dto';
import { VerificationCallbackDto } from './dto/verification-callback.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../auth/guards/optional-jwt-auth.guard';

@Controller('api/identity')
export class IdentityVerificationController {
  constructor(
    private readonly verificationService: IdentityVerificationService,
  ) {}

  @Post('request')
  @UseGuards(OptionalJwtAuthGuard)
  async requestVerification(
    @Body() dto: RequestVerificationDto,
    @Req() req: any,
  ) {
    const userId = req.user?.id;
    return this.verificationService.requestVerification(dto, userId);
  }

  @Post('callback')
  async handleCallback(@Body() dto: VerificationCallbackDto) {
    await this.verificationService.handleCallback(dto.verificationId);
    return { success: true };
  }

  @Get('callback')
  async handleCallbackGet(@Query('verificationId') verificationId: string) {
    await this.verificationService.handleCallback(verificationId);
    return { success: true };
  }

  @Get('status/:verificationId')
  async getStatus(@Param('verificationId') verificationId: string) {
    return this.verificationService.getStatus(verificationId);
  }
}
```

### 1.6 Auth Provider Interface

#### auth-provider.interface.ts

```typescript
export interface AuthProviderRequest {
  verificationId: string;
  name: string;
  phone: string;
  birthDate: string;
  authMethod?: string;
  returnUrl?: string;
}

export interface AuthProviderResponse {
  authUrl?: string;
  deepLink?: string;
  transactionId?: string;
}

export interface VerificationResult {
  success: boolean;
  ci?: string;
  di?: string;
  name?: string;
  birthDate?: string;
  gender?: string;
  phone?: string;
  errorCode?: string;
  errorMessage?: string;
}

export interface AuthProviderInterface {
  requestVerification(request: AuthProviderRequest): Promise<AuthProviderResponse>;
  getVerificationResult(verificationId: string): Promise<VerificationResult>;
}
```

### 1.7 Encryption Service

#### encryption.service.ts

```typescript
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

@Injectable()
export class EncryptionService {
  private readonly algorithm = 'aes-256-gcm';
  private readonly key: Buffer;

  constructor(private readonly configService: ConfigService) {
    const secretKey = this.configService.get<string>('ENCRYPTION_KEY');
    this.key = crypto.scryptSync(secretKey, 'salt', 32);
  }

  async encrypt(plainText: string): Promise<string> {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(this.algorithm, this.key, iv);

    let encrypted = cipher.update(plainText, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    const authTag = cipher.getAuthTag();

    return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
  }

  async decrypt(encryptedText: string): Promise<string> {
    const [ivHex, authTagHex, encrypted] = encryptedText.split(':');

    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');

    const decipher = crypto.createDecipheriv(this.algorithm, this.key, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  }

  async hash(text: string): Promise<string> {
    return crypto.createHash('sha256').update(text).digest('hex');
  }
}
```

---

## 2. Frontend 구현 (React + RTK)

### 2.1 폴더 구조 (FSD 기반)

```
src/
├── app/                              # 앱 초기화, 프로바이더
│   ├── store/
│   │   └── index.ts
│   └── providers/
│       └── index.tsx
├── features/                         # 기능 단위
│   └── identity-verification/
│       ├── api/
│       │   └── identityVerificationApi.ts
│       ├── model/
│       │   ├── types.ts
│       │   └── slice.ts
│       ├── ui/
│       │   ├── IdentityVerificationButton.tsx
│       │   ├── VerificationStatusModal.tsx
│       │   └── ProviderSelector.tsx
│       └── index.ts
├── entities/                         # 엔티티
│   └── user/
│       ├── model/
│       │   └── types.ts
│       └── index.ts
├── shared/                           # 공유 자원
│   ├── api/
│   │   └── baseApi.ts
│   ├── config/
│   │   └── index.ts
│   └── ui/
│       └── Modal/
│           └── index.tsx
└── pages/                            # 페이지
    └── VerificationPage/
        └── index.tsx
```

### 2.2 API Layer (RTK Query)

#### shared/api/baseApi.ts

```typescript
import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';

export const baseApi = createApi({
  reducerPath: 'api',
  baseQuery: fetchBaseQuery({
    baseUrl: import.meta.env.VITE_API_BASE_URL,
    prepareHeaders: (headers, { getState }) => {
      const token = (getState() as any).auth?.token;
      if (token) {
        headers.set('Authorization', `Bearer ${token}`);
      }
      return headers;
    },
  }),
  tagTypes: ['IdentityVerification', 'User'],
  endpoints: () => ({}),
});
```

#### features/identity-verification/api/identityVerificationApi.ts

```typescript
import { baseApi } from '@/shared/api/baseApi';
import {
  RequestVerificationPayload,
  RequestVerificationResponse,
  VerificationStatusResponse,
} from '../model/types';

export const identityVerificationApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    requestVerification: builder.mutation<
      RequestVerificationResponse,
      RequestVerificationPayload
    >({
      query: (body) => ({
        url: '/api/identity/request',
        method: 'POST',
        body,
      }),
    }),

    getVerificationStatus: builder.query<VerificationStatusResponse, string>({
      query: (verificationId) => `/api/identity/status/${verificationId}`,
      providesTags: (result, error, verificationId) => [
        { type: 'IdentityVerification', id: verificationId },
      ],
    }),

    pollVerificationStatus: builder.query<VerificationStatusResponse, string>({
      query: (verificationId) => `/api/identity/status/${verificationId}`,
      async onCacheEntryAdded(
        verificationId,
        { updateCachedData, cacheDataLoaded, cacheEntryRemoved }
      ) {
        await cacheDataLoaded;

        const poll = async () => {
          const response = await fetch(
            `${import.meta.env.VITE_API_BASE_URL}/api/identity/status/${verificationId}`
          );
          const data = await response.json();

          if (data.status !== 'PENDING') {
            updateCachedData(() => data);
            return true;
          }
          return false;
        };

        const interval = setInterval(async () => {
          const completed = await poll();
          if (completed) {
            clearInterval(interval);
          }
        }, 3000);

        await cacheEntryRemoved;
        clearInterval(interval);
      },
    }),
  }),
});

export const {
  useRequestVerificationMutation,
  useGetVerificationStatusQuery,
  usePollVerificationStatusQuery,
} = identityVerificationApi;
```

### 2.3 Types

#### features/identity-verification/model/types.ts

```typescript
export type AuthMethod = 'KAKAO' | 'NAVER' | 'PASS' | 'TOSS' | 'FINANCIAL';

export type VerificationStatus = 'PENDING' | 'VERIFIED' | 'FAILED' | 'EXPIRED';

export interface RequestVerificationPayload {
  name: string;
  phone: string;
  birthDate: string;
  authMethod?: AuthMethod;
  returnUrl?: string;
}

export interface RequestVerificationResponse {
  verificationId: string;
  authUrl?: string;
  deepLink?: string;
  expiresAt: string;
}

export interface VerificationStatusResponse {
  verificationId: string;
  status: VerificationStatus;
  verifiedName?: string;
  verifiedBirthDate?: string;
  verifiedGender?: string;
  ci?: string;
  di?: string;
  verifiedAt?: string;
  failureReason?: string;
}

export interface IdentityVerificationState {
  currentVerificationId: string | null;
  isModalOpen: boolean;
  selectedAuthMethod: AuthMethod | null;
}
```

### 2.4 Slice

#### features/identity-verification/model/slice.ts

```typescript
import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { AuthMethod, IdentityVerificationState } from './types';

const initialState: IdentityVerificationState = {
  currentVerificationId: null,
  isModalOpen: false,
  selectedAuthMethod: null,
};

export const identityVerificationSlice = createSlice({
  name: 'identityVerification',
  initialState,
  reducers: {
    setCurrentVerificationId: (state, action: PayloadAction<string | null>) => {
      state.currentVerificationId = action.payload;
    },
    openModal: (state) => {
      state.isModalOpen = true;
    },
    closeModal: (state) => {
      state.isModalOpen = false;
      state.currentVerificationId = null;
    },
    setSelectedAuthMethod: (state, action: PayloadAction<AuthMethod | null>) => {
      state.selectedAuthMethod = action.payload;
    },
    resetVerification: () => initialState,
  },
});

export const {
  setCurrentVerificationId,
  openModal,
  closeModal,
  setSelectedAuthMethod,
  resetVerification,
} = identityVerificationSlice.actions;

export const selectIdentityVerification = (state: { identityVerification: IdentityVerificationState }) =>
  state.identityVerification;
```

### 2.5 UI Components

#### features/identity-verification/ui/IdentityVerificationButton.tsx

```typescript
import React, { useCallback, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
  useRequestVerificationMutation,
  usePollVerificationStatusQuery,
} from '../api/identityVerificationApi';
import {
  setCurrentVerificationId,
  openModal,
  selectIdentityVerification,
} from '../model/slice';
import { RequestVerificationPayload } from '../model/types';
import { VerificationStatusModal } from './VerificationStatusModal';
import { ProviderSelector } from './ProviderSelector';

interface Props {
  userInfo: {
    name: string;
    phone: string;
    birthDate: string;
  };
  onSuccess?: (result: { ci: string; di: string }) => void;
  onFailure?: (error: string) => void;
}

export const IdentityVerificationButton: React.FC<Props> = ({
  userInfo,
  onSuccess,
  onFailure,
}) => {
  const dispatch = useDispatch();
  const { currentVerificationId, isModalOpen, selectedAuthMethod } = useSelector(
    selectIdentityVerification
  );

  const [requestVerification, { isLoading }] = useRequestVerificationMutation();
  const [showProviderSelector, setShowProviderSelector] = useState(false);

  const { data: statusData } = usePollVerificationStatusQuery(
    currentVerificationId!,
    { skip: !currentVerificationId }
  );

  const handleStartVerification = useCallback(async () => {
    if (!selectedAuthMethod) {
      setShowProviderSelector(true);
      return;
    }

    try {
      const payload: RequestVerificationPayload = {
        ...userInfo,
        authMethod: selectedAuthMethod,
        returnUrl: window.location.href,
      };

      const response = await requestVerification(payload).unwrap();

      dispatch(setCurrentVerificationId(response.verificationId));
      dispatch(openModal());

      // 인증 페이지 열기
      if (response.authUrl) {
        const width = 500;
        const height = 600;
        const left = window.screenX + (window.outerWidth - width) / 2;
        const top = window.screenY + (window.outerHeight - height) / 2;

        window.open(
          response.authUrl,
          'identity-verification',
          `width=${width},height=${height},left=${left},top=${top}`
        );
      }
    } catch (error: any) {
      onFailure?.(error.message || '인증 요청에 실패했습니다');
    }
  }, [userInfo, selectedAuthMethod, requestVerification, dispatch, onFailure]);

  // 인증 상태 변경 감지
  React.useEffect(() => {
    if (statusData?.status === 'VERIFIED' && statusData.ci && statusData.di) {
      onSuccess?.({ ci: statusData.ci, di: statusData.di });
    } else if (statusData?.status === 'FAILED') {
      onFailure?.(statusData.failureReason || '인증에 실패했습니다');
    }
  }, [statusData, onSuccess, onFailure]);

  return (
    <>
      <button
        onClick={handleStartVerification}
        disabled={isLoading}
        className="identity-verification-button"
      >
        {isLoading ? '처리중...' : '본인인증'}
      </button>

      {showProviderSelector && (
        <ProviderSelector
          onSelect={(method) => {
            setShowProviderSelector(false);
            handleStartVerification();
          }}
          onClose={() => setShowProviderSelector(false)}
        />
      )}

      {isModalOpen && currentVerificationId && (
        <VerificationStatusModal verificationId={currentVerificationId} />
      )}
    </>
  );
};
```

#### features/identity-verification/ui/ProviderSelector.tsx

```typescript
import React from 'react';
import { useDispatch } from 'react-redux';
import { setSelectedAuthMethod } from '../model/slice';
import { AuthMethod } from '../model/types';

interface Props {
  onSelect: (method: AuthMethod) => void;
  onClose: () => void;
}

const AUTH_PROVIDERS: Array<{ method: AuthMethod; name: string; icon: string }> = [
  { method: 'KAKAO', name: '카카오', icon: '/icons/kakao.svg' },
  { method: 'NAVER', name: '네이버', icon: '/icons/naver.svg' },
  { method: 'PASS', name: 'PASS', icon: '/icons/pass.svg' },
  { method: 'TOSS', name: '토스', icon: '/icons/toss.svg' },
  { method: 'FINANCIAL', name: '금융인증서', icon: '/icons/financial.svg' },
];

export const ProviderSelector: React.FC<Props> = ({ onSelect, onClose }) => {
  const dispatch = useDispatch();

  const handleSelect = (method: AuthMethod) => {
    dispatch(setSelectedAuthMethod(method));
    onSelect(method);
  };

  return (
    <div className="provider-selector-overlay" onClick={onClose}>
      <div className="provider-selector-modal" onClick={(e) => e.stopPropagation()}>
        <h3>인증 수단 선택</h3>
        <p>본인인증에 사용할 서비스를 선택해주세요</p>

        <div className="provider-list">
          {AUTH_PROVIDERS.map(({ method, name, icon }) => (
            <button
              key={method}
              className="provider-item"
              onClick={() => handleSelect(method)}
            >
              <img src={icon} alt={name} />
              <span>{name}</span>
            </button>
          ))}
        </div>

        <button className="close-button" onClick={onClose}>
          닫기
        </button>
      </div>
    </div>
  );
};
```

#### features/identity-verification/ui/VerificationStatusModal.tsx

```typescript
import React from 'react';
import { useDispatch } from 'react-redux';
import { usePollVerificationStatusQuery } from '../api/identityVerificationApi';
import { closeModal, resetVerification } from '../model/slice';
import { Modal } from '@/shared/ui/Modal';

interface Props {
  verificationId: string;
}

export const VerificationStatusModal: React.FC<Props> = ({ verificationId }) => {
  const dispatch = useDispatch();
  const { data, isLoading, error } = usePollVerificationStatusQuery(verificationId);

  const handleClose = () => {
    dispatch(closeModal());
    dispatch(resetVerification());
  };

  const renderContent = () => {
    if (isLoading || data?.status === 'PENDING') {
      return (
        <div className="verification-pending">
          <div className="spinner" />
          <p>인증 앱에서 본인인증을 완료해주세요</p>
          <p className="sub-text">인증 완료 후 자동으로 진행됩니다</p>
        </div>
      );
    }

    if (data?.status === 'VERIFIED') {
      return (
        <div className="verification-success">
          <div className="success-icon">✓</div>
          <p>본인인증이 완료되었습니다</p>
          <p className="verified-name">{data.verifiedName}님</p>
        </div>
      );
    }

    if (data?.status === 'FAILED' || data?.status === 'EXPIRED' || error) {
      return (
        <div className="verification-failed">
          <div className="error-icon">✕</div>
          <p>본인인증에 실패했습니다</p>
          <p className="error-message">
            {data?.failureReason || '잠시 후 다시 시도해주세요'}
          </p>
        </div>
      );
    }

    return null;
  };

  return (
    <Modal onClose={handleClose}>
      <div className="verification-status-modal">
        <h2>본인인증</h2>
        {renderContent()}
        {data?.status !== 'PENDING' && (
          <button className="confirm-button" onClick={handleClose}>
            확인
          </button>
        )}
      </div>
    </Modal>
  );
};
```

---

## 3. 데이터베이스 마이그레이션

### 3.1 TypeORM Migration

```typescript
import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

export class CreateIdentityVerificationTables1700000000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    // identity_verifications 테이블
    await queryRunner.createTable(
      new Table({
        name: 'identity_verifications',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'uuid_generate_v4()',
          },
          {
            name: 'verification_id',
            type: 'varchar',
            length: '100',
            isUnique: true,
          },
          {
            name: 'status',
            type: 'enum',
            enum: ['PENDING', 'VERIFIED', 'FAILED', 'EXPIRED'],
            default: "'PENDING'",
          },
          {
            name: 'provider',
            type: 'enum',
            enum: ['PORTONE', 'BAROCERT', 'INICIS'],
          },
          {
            name: 'auth_method',
            type: 'enum',
            enum: ['KAKAO', 'NAVER', 'PASS', 'TOSS', 'FINANCIAL'],
            isNullable: true,
          },
          {
            name: 'requested_name',
            type: 'varchar',
            length: '50',
          },
          {
            name: 'requested_phone',
            type: 'varchar',
            length: '20',
          },
          {
            name: 'requested_birth_date',
            type: 'varchar',
            length: '8',
          },
          {
            name: 'encrypted_ci',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'encrypted_di',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'ci_hash',
            type: 'varchar',
            length: '64',
            isNullable: true,
          },
          {
            name: 'verified_name',
            type: 'varchar',
            length: '50',
            isNullable: true,
          },
          {
            name: 'verified_birth_date',
            type: 'varchar',
            length: '8',
            isNullable: true,
          },
          {
            name: 'verified_gender',
            type: 'varchar',
            length: '1',
            isNullable: true,
          },
          {
            name: 'user_id',
            type: 'uuid',
            isNullable: true,
          },
          {
            name: 'created_at',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
          },
          {
            name: 'updated_at',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
          },
          {
            name: 'verified_at',
            type: 'timestamp',
            isNullable: true,
          },
          {
            name: 'expires_at',
            type: 'timestamp',
          },
          {
            name: 'failure_reason',
            type: 'varchar',
            length: '500',
            isNullable: true,
          },
        ],
      }),
      true
    );

    // 인덱스 생성
    await queryRunner.createIndex(
      'identity_verifications',
      new TableIndex({
        name: 'IDX_identity_verifications_ci_hash',
        columnNames: ['ci_hash'],
      })
    );

    await queryRunner.createIndex(
      'identity_verifications',
      new TableIndex({
        name: 'IDX_identity_verifications_user_id',
        columnNames: ['user_id'],
      })
    );

    await queryRunner.createIndex(
      'identity_verifications',
      new TableIndex({
        name: 'IDX_identity_verifications_status',
        columnNames: ['status'],
      })
    );

    // users 테이블에 CI/DI 컬럼 추가
    await queryRunner.query(`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS encrypted_ci TEXT,
      ADD COLUMN IF NOT EXISTS ci_hash VARCHAR(64) UNIQUE,
      ADD COLUMN IF NOT EXISTS encrypted_di TEXT,
      ADD COLUMN IF NOT EXISTS verified_name VARCHAR(50),
      ADD COLUMN IF NOT EXISTS verified_birth_date VARCHAR(8),
      ADD COLUMN IF NOT EXISTS verified_phone VARCHAR(20),
      ADD COLUMN IF NOT EXISTS verified_gender VARCHAR(1),
      ADD COLUMN IF NOT EXISTS is_identity_verified BOOLEAN DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS last_verified_at TIMESTAMP
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('identity_verifications');

    await queryRunner.query(`
      ALTER TABLE users
      DROP COLUMN IF EXISTS encrypted_ci,
      DROP COLUMN IF EXISTS ci_hash,
      DROP COLUMN IF EXISTS encrypted_di,
      DROP COLUMN IF EXISTS verified_name,
      DROP COLUMN IF EXISTS verified_birth_date,
      DROP COLUMN IF EXISTS verified_phone,
      DROP COLUMN IF EXISTS verified_gender,
      DROP COLUMN IF EXISTS is_identity_verified,
      DROP COLUMN IF EXISTS last_verified_at
    `);
  }
}
```

---

## 4. 환경 설정

### 4.1 Backend (.env)

```env
# 인증 제공자 설정
AUTH_PROVIDER=PORTONE

# PortOne 설정
PORTONE_STORE_ID=your-store-id
PORTONE_CHANNEL_KEY=your-channel-key
PORTONE_API_SECRET=your-api-secret

# Barocert 설정 (대안)
BAROCERT_LINK_ID=your-link-id
BAROCERT_SECRET_KEY=your-secret-key

# 암호화 키
ENCRYPTION_KEY=your-32-character-encryption-key

# 콜백 URL
IDENTITY_CALLBACK_URL=https://your-domain.com/api/identity/callback
```

### 4.2 Frontend (.env)

```env
VITE_API_BASE_URL=http://localhost:3000
VITE_IDENTITY_VERIFICATION_TIMEOUT=300000
```

---

## 5. 보안 체크리스트

| 항목 | 설명 | 상태 |
|------|------|------|
| HTTPS | 모든 API 통신 HTTPS 사용 | [ ] |
| API Key 보호 | 환경 변수로 관리, 클라이언트 노출 금지 | [ ] |
| CI/DI 암호화 | AES-256-GCM으로 암호화 저장 | [ ] |
| Rate Limiting | 인증 요청 속도 제한 (분당 5회) | [ ] |
| 세션 만료 | 인증 세션 5분 후 만료 | [ ] |
| 입력 검증 | 모든 사용자 입력 서버 측 검증 | [ ] |
| CORS | 허용된 도메인만 접근 가능 | [ ] |
| 로깅 | 민감 정보 제외한 감사 로그 | [ ] |

---

## 6. 테스트 계획

### 6.1 Backend 테스트

```typescript
describe('IdentityVerificationService', () => {
  describe('requestVerification', () => {
    it('should create verification request', async () => {});
    it('should reject invalid phone number', async () => {});
    it('should reject invalid birth date', async () => {});
  });

  describe('handleCallback', () => {
    it('should verify successful authentication', async () => {});
    it('should reject expired verification', async () => {});
    it('should reject duplicate verification', async () => {});
  });

  describe('getStatus', () => {
    it('should return verification status', async () => {});
    it('should decrypt CI/DI for verified status', async () => {});
  });
});
```

### 6.2 Frontend 테스트

```typescript
describe('IdentityVerificationButton', () => {
  it('should open provider selector when no method selected', () => {});
  it('should request verification with selected method', () => {});
  it('should poll for status updates', () => {});
  it('should call onSuccess when verified', () => {});
  it('should call onFailure when failed', () => {});
});
```

---

## 7. 구현 순서

1. **Phase 1: Backend 기본 구조**
   - Entity 생성
   - Migration 실행
   - DTO 정의

2. **Phase 2: Backend 핵심 로직**
   - EncryptionService 구현
   - AuthProvider Interface 정의
   - IdentityVerificationService 구현

3. **Phase 3: Backend API**
   - Controller 구현
   - 인증 제공자 연동 (PortOne 또는 Barocert)
   - 테스트 작성

4. **Phase 4: Frontend 기본 구조**
   - RTK Query API 설정
   - Slice 생성
   - Types 정의

5. **Phase 5: Frontend UI**
   - ProviderSelector 구현
   - IdentityVerificationButton 구현
   - VerificationStatusModal 구현

6. **Phase 6: 통합 및 테스트**
   - E2E 테스트
   - 보안 검토
   - 성능 최적화
