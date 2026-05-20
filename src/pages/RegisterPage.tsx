import { useState, useEffect, useCallback } from 'react';
import { useParams, useSearchParams, Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import {
  CheckCircle2, Calendar, MapPin, Clock, Loader2, Building2,
  AlertCircle, XCircle, User, Users, Mail, ScanLine,
} from 'lucide-react';
import { toast } from 'sonner';

type Kind = 'event' | 'training';

interface CommonData {
  id: string;
  title: string;
  description: string | null;
  event_date: string;
  start_time: string;
  end_time: string;
  location: string;
  organizer: string;
  status: string | null;
  poster_url: string | null;
  show_car_number: boolean;
  // training-only
  instructor?: string | null;
  capacity_enabled?: boolean;
  capacity?: number | null;
  allow_waitlist?: boolean;
}

const ORG_TYPES = ['경기도', '시군', '공공기관', '기타'] as const;

const RegisterPage = () => {
  const { accessCode } = useParams<{ accessCode: string }>();
  const [searchParams] = useSearchParams();
  const code = accessCode || searchParams.get('code') || '';

  const [kind, setKind] = useState<Kind | null>(null);
  const [data, setData] = useState<CommonData | null>(null);
  const [registeredCount, setRegisteredCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [expired, setExpired] = useState(false);
  const [preRegClosed, setPreRegClosed] = useState(false);
  const [inProgress, setInProgress] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState<null | { status: string; position?: number }>(null);
  const [duplicate, setDuplicate] = useState(false);
  const [closed, setClosed] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [form, setForm] = useState({
    email: '',
    org_type: '',
    custom_org_type: '',
    organization: '',
    department: '',
    position: '',
    name: '',
    phone: '',
    car_number: '',
    privacy_agreed: false,
  });

  const fetchAll = useCallback(async () => {
    if (!code) { setNotFound(true); setLoading(false); return; }
    // 공개 상태 게이트 (시간 기반)
    const { data: phaseData } = await supabase.rpc('get_event_public_status', { p_code: code });
    const phase = (phaseData as any)?.phase as string | undefined;
    if (phase === 'not_found') { setNotFound(true); setLoading(false); return; }
    if (phase === 'closed') { setExpired(true); /* fall through to load data for title */ }
    else if (phase === 'in_progress') setInProgress(true);
    else if (phase === 'pre_reg_closed') setPreRegClosed(true);

    // try training first, then event
    const { data: t } = await supabase.from('trainings').select('*').eq('access_code', code).maybeSingle();
    if (t) {
      setKind('training');
      setData(t as CommonData);
      if (t.status === '완료') { setExpired(true); setLoading(false); return; }
      const { data: cnt } = await supabase.rpc('count_trainees_registered', { p_training_id: t.id });
      const count = (cnt as number) ?? 0;
      setRegisteredCount(count);
      if (t.capacity_enabled && t.capacity != null && count >= t.capacity && !t.allow_waitlist) setClosed(true);
      setLoading(false);
      return;
    }
    const { data: e } = await supabase.from('events').select('*').eq('access_code', code).maybeSingle();
    if (e) {
      setKind('event');
      setData(e as CommonData);
      if (e.status === '완료') { setExpired(true); setLoading(false); return; }
      setLoading(false);
      return;
    }
    setNotFound(true);
    setLoading(false);
  }, [code]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const updateField = (key: string, value: string | boolean) => {
    setForm({ ...form, [key]: value });
    if (errors[key]) setErrors({ ...errors, [key]: '' });
  };

  const validate = () => {
    const e: Record<string, string> = {};
    if (!form.email.trim()) e.email = '이메일을 입력해주세요.';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) e.email = '올바른 이메일 형식이 아닙니다.';
    if (!form.org_type) e.org_type = '소속 구분을 선택해주세요.';
    if (!form.organization.trim()) e.organization = '기관명을 입력해주세요.';
    if (!form.department.trim()) e.department = '부서명을 입력해주세요.';
    if (!form.position.trim()) e.position = '직급(위)을 입력해주세요.';
    if (!form.name.trim()) e.name = '성함을 입력해주세요.';
    if (!form.privacy_agreed) e.privacy_agreed = '개인정보 수집 및 이용에 동의해주세요.';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!data || !kind) return;
    if (!validate()) { toast.error('필수 항목을 확인해주세요.'); return; }
    setSubmitting(true);
    try {
      const finalOrgType = form.org_type;
      if (kind === 'event') {
        const { data: res, error } = await supabase.rpc('register_attendee_pre', {
          p_event_id: data.id,
          p_email: form.email.trim(),
          p_org_type: finalOrgType,
          p_organization: form.organization.trim(),
          p_department: form.department.trim(),
          p_position: form.position.trim(),
          p_name: form.name.trim(),
          p_phone: form.phone.trim(),
          p_car_number: form.car_number.trim(),
          p_privacy_agreed: form.privacy_agreed,
        });
        if (error) throw error;
        const r = res as { status: string; device_token?: string };
        if (r.status === 'duplicate') { setDuplicate(true); return; }
        if (r.device_token) {
          try { localStorage.setItem(`device_token:event:${data.id}`, r.device_token); } catch {}
        }
        setSuccess({ status: r.status });
      } else {
        const { data: res, error } = await supabase.rpc('register_trainee', {
          p_training_id: data.id,
          p_org_type: finalOrgType,
          p_organization: form.organization.trim(),
          p_department: form.department.trim(),
          p_position: form.position.trim(),
          p_name: form.name.trim(),
          p_car_number: form.car_number.trim(),
          p_inquiry: '',
          p_privacy_agreed: form.privacy_agreed,
          p_email: form.email.trim(),
        });
        if (error) throw error;
        const r = res as { status: string; position?: number; device_token?: string };
        if (r.status === 'duplicate') { setDuplicate(true); return; }
        if (r.status === 'full') { setClosed(true); return; }
        if (r.device_token) {
          try { localStorage.setItem(`device_token:training:${data.id}`, r.device_token); } catch {}
        }
        setSuccess({ status: r.status, position: r.position });
      }
    } catch (err) {
      console.error(err);
      const msg = (err as any)?.message || '';
      if (msg.includes('Pre-registration closed')) { setPreRegClosed(true); }
      else if (msg.includes('Event closed') || msg.includes('Training closed')) { setExpired(true); }
      else toast.error('사전 신청 중 오류가 발생했습니다. 다시 시도해주세요.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <div className="min-h-svh bg-background flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;

  if (notFound) return (
    <div className="min-h-svh bg-background flex items-center justify-center p-4">
      <div className="text-center space-y-4 animate-fade-in">
        <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-destructive/10"><XCircle className="w-10 h-10 text-destructive" /></div>
        <h2 className="text-xl font-bold text-foreground">정보를 찾을 수 없습니다</h2>
        <p className="text-muted-foreground text-sm">접속코드를 다시 확인해주세요.</p>
      </div>
    </div>
  );

  if (expired) return (
    <div className="min-h-svh bg-background flex items-center justify-center p-4">
      <div className="text-center space-y-4 animate-fade-in">
        <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-warning/10"><AlertCircle className="w-10 h-10 text-warning" /></div>
        <h2 className="text-xl font-bold text-foreground">신청이 마감되었습니다</h2>
        <p className="text-muted-foreground text-sm">{data?.title}은(는) 종료되었습니다.</p>
      </div>
    </div>
  );

  if (preRegClosed && !success) return (
    <div className="min-h-svh bg-background flex items-center justify-center p-4">
      <div className="text-center space-y-4 animate-fade-in max-w-md">
        <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-warning/10"><AlertCircle className="w-10 h-10 text-warning" /></div>
        <h2 className="text-xl font-bold text-foreground">사전 신청이 마감되었습니다</h2>
        <p className="text-muted-foreground text-sm">사전 신청 기간이 종료되었습니다.<br />당일 현장 등록은 가능합니다.</p>
        <Link to={kind === 'training' ? `/training/${code}` : `/attend/${code}`}>
          <Button className="px-8 h-12 text-base rounded-xl">현장 등록 페이지로 이동</Button>
        </Link>
      </div>
    </div>
  );

  if (inProgress && !success) return (
    <div className="min-h-svh bg-background flex items-center justify-center p-4">
      <div className="text-center space-y-4 animate-fade-in max-w-md">
        <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-primary/10"><ScanLine className="w-10 h-10 text-primary" /></div>
        <h2 className="text-xl font-bold text-foreground">행사가 진행 중입니다</h2>
        <p className="text-muted-foreground text-sm">현재 진행 중인 행사입니다.<br />현장 체크인 페이지를 이용해주세요.</p>
        <Link to={kind === 'training' ? `/training/${code}` : `/attend/${code}`}>
          <Button className="px-8 h-12 text-base rounded-xl">현장 체크인하러 가기</Button>
        </Link>
      </div>
    </div>
  );

  if (closed && !success) return (
    <div className="min-h-svh bg-background flex items-center justify-center p-4">
      <div className="text-center space-y-4 animate-fade-in">
        <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-warning/10"><Users className="w-10 h-10 text-warning" /></div>
        <h2 className="text-xl font-bold text-foreground">정원이 마감되었습니다</h2>
        <p className="text-muted-foreground text-sm">현재 모든 자리가 신청 완료되어<br />추가 신청을 받지 않습니다.</p>
      </div>
    </div>
  );

  if (duplicate) return (
    <div className="min-h-svh bg-background flex items-center justify-center p-4">
      <div className="text-center space-y-4 animate-fade-in">
        <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-warning/10"><AlertCircle className="w-10 h-10 text-warning" /></div>
        <h2 className="text-xl font-bold text-foreground">이미 신청된 이메일입니다</h2>
        <p className="text-muted-foreground text-sm">동일한 이메일로 사전 신청이 완료되었습니다.<br />당일 현장에서 체크인하실 수 있습니다.</p>
      </div>
    </div>
  );

  if (success) {
    const isWait = success.status === 'waitlisted';
    return (
      <div className="min-h-svh bg-background flex items-center justify-center p-4">
        <div className="text-center space-y-4 animate-fade-in max-w-md">
          <div className={`inline-flex items-center justify-center w-20 h-20 rounded-full animate-check-bounce ${isWait ? 'bg-warning/10' : 'bg-success/10'}`}>
            {isWait ? <Clock className="w-10 h-10 text-warning" /> : <CheckCircle2 className="w-10 h-10 text-success" />}
          </div>
          <h2 className="text-xl font-bold text-foreground">
            {isWait ? `대기자 ${success.position}번으로 등록되었습니다` : '사전 신청이 완료되었습니다 ✓'}
          </h2>
          <p className="text-muted-foreground text-sm leading-relaxed">
            {isWait
              ? <>현재 정원이 마감되어 대기자로 등록되었습니다.<br />자리가 나면 담당자가 안내드립니다.</>
              : <>당일 현장에서 <span className="font-semibold text-foreground">이 스마트폰으로</span> QR을 찍으시면<br />바로 서명 화면이 나타납니다.</>}
          </p>
          <div className="bg-secondary/40 rounded-xl p-4 text-sm text-left space-y-1.5">
            <p className="font-semibold text-foreground">{data?.title}</p>
            <p className="text-muted-foreground"><Calendar className="inline w-3.5 h-3.5 mr-1" />{data?.event_date} {data?.start_time?.slice(0,5)} ~ {data?.end_time?.slice(0,5)}</p>
            <p className="text-muted-foreground"><MapPin className="inline w-3.5 h-3.5 mr-1" />{data?.location}</p>
          </div>
          <Button variant="outline" className="px-8 h-12 text-base rounded-xl" onClick={() => window.location.href = '/'}>확인</Button>
        </div>
      </div>
    );
  }

  const willBeWaitlisted = kind === 'training' && !!data?.capacity_enabled && data?.capacity != null
    && registeredCount >= (data?.capacity || 0) && !!data?.allow_waitlist;

  return (
    <div className="min-h-svh bg-muted/30 pb-8" translate="no">
      <div className="bg-primary text-primary-foreground px-4 py-3 flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-primary-foreground/20 flex items-center justify-center shrink-0">
          <Building2 className="w-6 h-6" />
        </div>
        <span className="text-sm font-medium opacity-90">
          {kind === 'training' ? '교육 사전 신청' : '행사 사전 신청'}
        </span>
      </div>

      <div className="px-4 pt-5 max-w-lg mx-auto">
        <Link to={kind === 'training' ? `/training/${code}` : `/attend/${code}`}
          className="mb-4 flex items-center gap-2 bg-secondary/70 border border-border rounded-lg p-3 text-sm text-foreground hover:bg-secondary transition-colors">
          <ScanLine className="w-4 h-4 text-primary" />
          <span>현장에 오셨나요? <strong>현장 체크인 바로가기</strong></span>
        </Link>

        <div className="bg-card rounded-xl shadow-card overflow-hidden mb-5 animate-fade-in">
          {data?.poster_url && <img src={data.poster_url} alt="포스터" className="w-full max-h-56 object-contain bg-secondary/30" />}
          <div className="p-5">
            <h1 className="text-lg font-bold text-foreground leading-snug">{data?.title}</h1>
            {data?.description && <p className="text-sm text-muted-foreground mt-1.5">{data.description}</p>}
            <div className="mt-4 space-y-2">
              <div className="flex items-center gap-2 text-sm text-muted-foreground"><Calendar className="w-4 h-4 text-primary shrink-0" /><span>{data?.event_date}</span></div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground"><Clock className="w-4 h-4 text-primary shrink-0" /><span>{data?.start_time?.slice(0,5)} ~ {data?.end_time?.slice(0,5)}</span></div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground"><MapPin className="w-4 h-4 text-primary shrink-0" /><span>{data?.location}</span></div>
              {kind === 'training' && data?.instructor && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground"><User className="w-4 h-4 text-primary shrink-0" /><span>강사: {data.instructor}</span></div>
              )}
              {kind === 'training' && data?.capacity_enabled && data?.capacity != null && (
                <div className="flex items-center gap-2 text-sm">
                  <Users className={`w-4 h-4 shrink-0 ${willBeWaitlisted ? 'text-warning' : 'text-primary'}`} />
                  <span className={willBeWaitlisted ? 'text-warning font-medium' : 'text-muted-foreground'}>
                    정원 {data.capacity}명 중 {registeredCount}명 신청
                    {willBeWaitlisted && ' — 대기자로 등록됩니다'}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>

        {willBeWaitlisted && (
          <div className="mb-4 bg-warning/10 border border-warning/30 rounded-xl p-4 text-sm text-foreground flex items-start gap-2">
            <AlertCircle className="w-5 h-5 text-warning shrink-0 mt-0.5" />
            <span>현재 정원이 마감되었습니다. 신청하시면 <strong>대기자 명단</strong>에 등록되며, 자리가 나면 안내드립니다.</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5" noValidate>
          <div className="bg-card rounded-xl shadow-card p-5 space-y-5 animate-fade-in">
            <p className="text-sm font-medium text-foreground">사전 신청 정보를 입력해주세요. (서명은 당일 현장에서 진행)</p>

            {/* Email */}
            <div className="space-y-1.5">
              <label className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                <Mail className="w-4 h-4 text-primary" />이메일 <span className="text-destructive">*</span>
              </label>
              <Input type="email" inputMode="email" autoComplete="email"
                value={form.email} onChange={(e) => updateField('email', e.target.value)}
                placeholder="현장 체크인에 사용됩니다"
                className={`h-12 bg-secondary/50 border-border/60 ${errors.email ? 'border-destructive' : ''}`} />
              {errors.email && <p className="text-xs text-destructive">{errors.email}</p>}
            </div>

            {/* org_type */}
            <div className="space-y-2">
              <label className="text-sm font-semibold text-foreground">소속(구분) <span className="text-destructive">*</span></label>
              <div className="flex gap-3">
                {ORG_TYPES.map((t) => (
                  <label key={t} className={`flex-1 text-center py-2.5 rounded-lg border-2 cursor-pointer text-sm font-medium transition-all ${
                    form.org_type === t ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-secondary/50 text-muted-foreground hover:border-primary/40'
                  }`}>
                    <input type="radio" name="org_type" value={t} checked={form.org_type === t}
                      onChange={(e) => {
                        const v = e.target.value;
                        setForm((prev) => ({
                          ...prev,
                          org_type: v,
                          organization: v === '경기도' ? '경기도' : (prev.org_type === '경기도' ? '' : prev.organization),
                        }));
                        if (errors.org_type) setErrors({ ...errors, org_type: '' });
                        if (v === '경기도' && errors.organization) setErrors({ ...errors, organization: '' });
                      }} className="sr-only" />
                    {t}
                  </label>
                ))}
              </div>
              {errors.org_type && <p className="text-xs text-destructive">{errors.org_type}</p>}
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-semibold text-foreground">기관명 <span className="text-destructive">*</span></label>
              <Input value={form.organization} onChange={(e) => updateField('organization', e.target.value)}
                disabled={form.org_type === '경기도'}
                placeholder={form.org_type === '경기도' ? '경기도 (자동 입력)' : '기관명을 입력해주세요'}
                className={`h-12 bg-secondary/50 border-border/60 ${errors.organization ? 'border-destructive' : ''} ${form.org_type === '경기도' ? 'opacity-70' : ''}`} />
              {errors.organization && <p className="text-xs text-destructive">{errors.organization}</p>}
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-semibold text-foreground">부서명 <span className="text-destructive">*</span></label>
              <Input value={form.department} onChange={(e) => updateField('department', e.target.value)}
                placeholder="예: AI데이터행정과, 영통구 건축과 등"
                className={`h-12 bg-secondary/50 border-border/60 ${errors.department ? 'border-destructive' : ''}`} />
              {errors.department && <p className="text-xs text-destructive">{errors.department}</p>}
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-semibold text-foreground">직급(위) <span className="text-destructive">*</span></label>
              <Input value={form.position} onChange={(e) => updateField('position', e.target.value)}
                placeholder="예: 데이터분석팀장, 행정6급, 대리 등"
                className={`h-12 bg-secondary/50 border-border/60 ${errors.position ? 'border-destructive' : ''}`} />
              {errors.position && <p className="text-xs text-destructive">{errors.position}</p>}
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-semibold text-foreground">성함 <span className="text-destructive">*</span></label>
              <Input value={form.name} onChange={(e) => updateField('name', e.target.value)}
                placeholder="성함을 입력해주세요"
                className={`h-12 bg-secondary/50 border-border/60 ${errors.name ? 'border-destructive' : ''}`} />
              {errors.name && <p className="text-xs text-destructive">{errors.name}</p>}
            </div>

            {data?.show_car_number && (
              <div className="space-y-1.5">
                <label className="text-sm font-semibold text-foreground">차량번호</label>
                <Input value={form.car_number} onChange={(e) => updateField('car_number', e.target.value)}
                  placeholder="차량 등록이 필요하신 경우 기재해주세요"
                  className="h-12 bg-secondary/50 border-border/60" />
              </div>
            )}
          </div>

          <div className="bg-card rounded-xl shadow-card p-5 space-y-4 animate-fade-in">
            <label className="text-sm font-semibold text-foreground">개인정보 수집 및 이용 동의 <span className="text-destructive">*</span></label>
            <div className="bg-secondary/50 rounded-lg p-4 text-sm text-muted-foreground space-y-2">
              <div><span className="font-medium text-foreground">수집 항목</span><p>이메일, 성함, 소속, 부서명, 직급{data?.show_car_number ? ', 차량번호' : ''}</p></div>
              <div><span className="font-medium text-foreground">이용 목적</span><p>{kind === 'training' ? '교육' : '행사'} 사전 신청 및 현장 확인</p></div>
              <div><span className="font-medium text-foreground">보유 기간</span><p className="text-primary font-medium">{kind === 'training' ? '교육' : '행사'} 종료 후 폐기</p></div>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox id="privacy" checked={form.privacy_agreed}
                onCheckedChange={(checked) => updateField('privacy_agreed', !!checked)} />
              <label htmlFor="privacy" className="text-sm text-foreground cursor-pointer">위 내용에 동의합니다</label>
            </div>
            {errors.privacy_agreed && <p className="text-xs text-destructive">{errors.privacy_agreed}</p>}
          </div>

          <Button type="submit" disabled={submitting}
            className="w-full h-14 text-base rounded-xl font-semibold">
            {submitting ? <><Loader2 className="w-4 h-4 animate-spin mr-2" />등록 중...</> : '사전 신청하기'}
          </Button>
        </form>
      </div>
    </div>
  );
};

export default RegisterPage;
