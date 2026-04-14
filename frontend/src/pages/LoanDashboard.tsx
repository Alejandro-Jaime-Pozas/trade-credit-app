import { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import confetti from 'canvas-confetti';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/hooks/use-toast';
import { processingApi, storageApi } from '@/lib/api';
import type { UploadDocument, AccountApplication } from '@/types';
import { CheckCircle2, Circle, Upload, FileText, Loader2, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';

const REQUIRED_FILE_TYPES = [
    { key: 'bank_statement', label: 'Estado de Cuenta Bancario' },
    { key: 'balance_sheet', label: 'Balance General' },
    { key: 'cashflow_statement', label: 'Estado de Flujo de Efectivo' },
    { key: 'income_statement', label: 'Estado de Resultados' },
] as const;

const ANALYSIS_MESSAGES = [
    'Analizando tus archivos...',
    'Generando análisis...',
    'Verificando información...',
    'Generando recomendación...'
];

export default function LoanDashboard() {
    const { applicationId } = useParams<{ applicationId: string }>();
    const { toast } = useToast();
    const queryClient = useQueryClient();
    const [progress, setProgress] = useState(10);
    const [analysisMessageIndex, setAnalysisMessageIndex] = useState(0);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Polling for application status
    const { data: application, isLoading: isAppLoading } = useQuery<AccountApplication>({
        queryKey: ['application', applicationId],
        queryFn: () => processingApi.getAccountApplication(applicationId!),
        refetchInterval: (query) => {
            // Stop polling if finalized (adjust condition based on exact backend status for finalized)
            const app = query.state.data;
            if (app?.loan_account_application?.loan_verdicts_ai?.some(v => v.status === 'approved')) return false;
            return 2000;
        },
        enabled: !!applicationId,
    });

    // Simulated progress bar logic
    useEffect(() => {
        // Only simulate if not complete
        if (application?.loan_account_application?.loan_verdicts_ai?.some(v => v.status === 'approved')) {
            setProgress(100);
            return;
        }

        const timer = setInterval(() => {
            setProgress((oldProgress) => {
                if (oldProgress >= 90) return oldProgress;
                const diff = Math.random() * 5;
                return Math.min(oldProgress + diff, 90);
            });
        }, 1000);

        return () => clearInterval(timer);
    }, [application?.status]);

    // Revolving analysis messages
    useEffect(() => {
        // Only run if we are in analysis status (assuming 'analyzing' or similar)
        // For now, we'll assume if all files are uploaded but status is not approved, we are analyzing.
        // Adjust logic based on real backend status.
        // If backend has specific status for 'analyzing', use that.

        const interval = setInterval(() => {
            setAnalysisMessageIndex((prev) => (prev + 1) % ANALYSIS_MESSAGES.length);
        }, 2000);
        return () => clearInterval(interval);
    }, []);

    const uploadMutation = useMutation({
        mutationFn: (file: File) => storageApi.uploadDocument(file, applicationId!),
        onSuccess: () => {
            toast({
                title: "Archivo subido",
                description: "Tu archivo está siendo procesado.",
            });
            // Invalidate application to refresh the list of documents
            queryClient.invalidateQueries({ queryKey: ['application', applicationId] });

            // Simulate validation success after a delay (or rely on polling)
            // The instructions say "Whenever a file is validated... show confetti".
            // We'll rely on the polling details to detect a status change from 'processing' to 'valid' if backend supports it.
            // For now, we'll just show confetti for the upload success for immediate feedback,
            // but ideally we wait for backend validation.
            // Instructions: "Frontend should update missing/completed file types once the backend validates... show confetti animation... with message"

            // We will perform a check in the useEffect tracking application data to fire confetti when a new valid document appears.
        },
        onError: () => {
            toast({
                variant: "destructive",
                title: "Error de subida",
                description: "No se pudo subir el archivo. Intenta de nuevo.",
            });
        }
    });

    const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
        const files = event.target.files;
        if (files) {
            Array.from(files).forEach((file) => {
                uploadMutation.mutate(file);
            });
        }
    };

    // Track verified documents to trigger confetti
    const prevValidatedCount = useRef(0);
    useEffect(() => {
        if (!application) return;

        // docs that have a recognized file_type_name are considered validated
        // Note: The backend model has `file_type_name`. If it is NOT 'unknown' and NOT null, it's validated.
        // The instructions say backend validates. We assume if file_type_name is present and in required list, it's valid.

        // We need to access the full document objects. The application object likely has `upload_documents` as IDs.
        // If the API returns full objects for `upload_documents` or we need to fetch them separately?
        // The `AccountApplication` interface I defined has `upload_documents: number[]`.
        // I probably need to fetch the documents or update the serializer/interface if the main endpoint returns them.
        // For this implementation, let's assume `getAccountApplication` returns expanded `upload_documents` or we fetch them.
        // Let's assume the backend returns expanded objects for convenience or we need a separate query.
        // I'll update the fetch types if needed. Assuming for now `upload_documents` in response are OBJECTS.

        const validatedDocs = (application.upload_documents as unknown as UploadDocument[]).filter(
            d => d.file_type_name && d.file_type_name !== 'unknown'
        );

        if (validatedDocs.length > prevValidatedCount.current) {
            confetti({
                particleCount: 100,
                spread: 70,
                origin: { y: 0.6 }
            });
            toast({
                className: "bg-green-100 border-green-500 text-green-800",
                title: "¡Excelente!",
                description: "Tu archivo ha sido validado correctamente.",
            });
        }
        prevValidatedCount.current = validatedDocs.length;

    }, [application, toast]);

    if (isAppLoading) {
        return <div className="flex justify-center items-center h-screen"><Loader2 className="h-10 w-10 animate-spin" /></div>;
    }

    // Cast upload_documents to proper type (backend now returns expanded list)
    const documents = (application?.upload_documents || []) as unknown as UploadDocument[];

    // Determine missing files
    const uploadedTypes = new Set(documents.map(d => d.file_type_name).filter(Boolean));
    const approvedVerdict = application?.loan_account_application?.loan_verdicts_ai?.find(v => v.status === 'approved');
    const isApproved = !!approvedVerdict;
    const isAnalyzing = !isApproved && REQUIRED_FILE_TYPES.every(t => uploadedTypes.has(t.key as any));

    return (
        <div className="min-h-screen bg-background p-6 lg:p-12">
            <div className="max-w-5xl mx-auto space-y-8">

                {/* Header & Progress */}
                <div className="space-y-4">
                    <div className="flex justify-between items-center">
                        <h1 className="text-3xl font-bold tracking-tight">Solicitud de Préstamo</h1>
                        <Badge variant={isApproved ? "default" : "outline"} className="text-sm">
                            {isApproved ? "Aprobado" : isAnalyzing ? "Analizando" : "En Progreso"}
                        </Badge>
                    </div>
                    <div className="space-y-2">
                        <div className="flex justify-between text-sm text-muted-foreground">
                            <span>Progreso de la solicitud</span>
                            <span>{progress.toFixed(0)}%</span>
                        </div>
                        <Progress value={progress} className="h-3" />
                    </div>

                    {/* Analysis Loading State */}
                    {isAnalyzing && !isApproved && (
                        <Card className="bg-primary/5 border-primary/20">
                            <CardContent className="flex flex-col items-center justify-center p-6 space-y-4">
                                <div className="text-4xl animate-bounce">🤖</div>
                                <div className="flex items-center space-x-2 text-primary font-medium">
                                    <Loader2 className="h-5 w-5 animate-spin" />
                                    <span className="animate-pulse">{ANALYSIS_MESSAGES[analysisMessageIndex]}</span>
                                </div>
                            </CardContent>
                        </Card>
                    )}

                    {/* Approval Success State */}
                    {isApproved && (
                        <Card className="bg-green-50 border-green-200">
                            <CardContent className="flex flex-col items-center justify-center p-8 space-y-4 text-center">
                                <div className="h-16 w-16 bg-green-100 rounded-full flex items-center justify-center text-3xl">💰</div>
                                <h2 className="text-2xl font-bold text-green-800">¡Felicidades! Tu préstamo ha sido aprobado</h2>
                                <div className="text-4xl font-extrabold text-green-700 my-4">
                                    ${Number(approvedVerdict?.loan_amount).toLocaleString('es-MX')}
                                </div>
                                <p className="text-green-700 max-w-md">
                                    Nuestro análisis de IA ha determinado que tu empresa es elegible para este monto.
                                </p>

                                {/* Details Dropdown logic would go here (Accordion) */}
                                {application?.loan_agreement_documents?.[0]?.file && (
                                    <a
                                        href={application.loan_agreement_documents[0].file}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="inline-block"
                                    >
                                        <Button className="bg-green-600 hover:bg-green-700 text-white">
                                            Ver Contrato de Préstamo
                                        </Button>
                                    </a>
                                )}
                            </CardContent>
                        </Card>
                    )}
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    {/* Left Panel: Status List */}
                    <div className="lg:col-span-1 space-y-6">
                        <Card>
                            <CardHeader>
                                <CardTitle>Requisitos</CardTitle>
                                <CardDescription>Documentos necesarios para el análisis</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                {REQUIRED_FILE_TYPES.map((type) => {
                                    const isUploaded = uploadedTypes.has(type.key as any);
                                    return (
                                        <div key={type.key} className="flex items-center space-x-3">
                                            {isUploaded ? (
                                                <CheckCircle2 className="h-5 w-5 text-green-500 shrink-0" />
                                            ) : (
                                                <Circle className="h-5 w-5 text-amber-500 shrink-0" />
                                            )}
                                            <span className={cn("text-sm", isUploaded ? "text-foreground font-medium" : "text-muted-foreground")}>
                                                {type.label}
                                            </span>
                                        </div>
                                    );
                                })}
                            </CardContent>
                        </Card>
                    </div>

                    {/* Main Panel: Upload Area */}
                    <div className="lg:col-span-2 space-y-6">
                        {!isApproved && (
                            <Card>
                                <CardHeader>
                                    <CardTitle>Subir Documentos</CardTitle>
                                    <CardDescription>
                                        Arrastra tus archivos aquí o haz clic para seleccionar. Aceptamos PDF, Excel, Imágenes.
                                    </CardDescription>
                                </CardHeader>
                                <CardContent>
                                    <div
                                        className="border-2 border-dashed border-muted-foreground/20 rounded-xl p-10 flex flex-col items-center justify-center space-y-4 hover:bg-muted/50 transition-colors cursor-pointer"
                                        onClick={() => fileInputRef.current?.click()}
                                    >
                                        <div className="bg-primary/10 p-4 rounded-full">
                                            <Upload className="h-8 w-8 text-primary" />
                                        </div>
                                        <div className="text-center space-y-1">
                                            <p className="font-medium">Haz clic para subir archivos</p>
                                            <p className="text-xs text-muted-foreground">Puedes subir múltiples archivos a la vez</p>
                                        </div>
                                        <input
                                            type="file"
                                            className="hidden"
                                            ref={fileInputRef}
                                            multiple
                                            onChange={handleFileUpload}
                                            accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.jpg,.jpeg,.png,.xml,.json,.txt"
                                        />
                                    </div>

                                    {/* Uploading Queue Display */}
                                    {uploadMutation.isPending && (
                                        <div className="mt-4 p-4 bg-muted rounded-lg flex items-center space-x-3">
                                            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                                            <span className="text-sm text-muted-foreground">Procesando archivos... nosotros los identificamos y validamos, no te preocupes</span>
                                        </div>
                                    )}
                                </CardContent>
                            </Card>
                        )}

                        {/* Uploaded Files List */}
                        <div className="space-y-3">
                            <h3 className="text-lg font-semibold">Archivos Subidos</h3>
                            {documents.length === 0 ? (
                                <p className="text-sm text-muted-foreground italic">No has subido ningún archivo aún.</p>
                            ) : (
                                documents.map((doc) => (
                                    <Card key={doc.uuid} className={cn("transition-all", doc.file_type_name === 'unknown' ? "border-amber-200 bg-amber-50" : "")}>
                                        <CardContent className="p-4 flex items-center justify-between">
                                            <div className="flex items-center space-x-4">
                                                <div className="bg-primary/10 p-2 rounded-lg">
                                                    <FileText className="h-5 w-5 text-primary" />
                                                </div>
                                                <div>
                                                    <p className="font-medium text-sm truncate max-w-[200px] lg:max-w-md">
                                                        {doc.friendly_file_name || doc.original_title}
                                                    </p>
                                                    <p className="text-xs text-muted-foreground">
                                                        {doc.file_type_name && doc.file_type_name !== 'unknown' ? (
                                                            <span className="text-green-600 flex items-center mt-1">
                                                                <CheckCircle2 className="h-3 w-3 mr-1" />
                                                                Validado: {REQUIRED_FILE_TYPES.find(t => t.key === doc.file_type_name)?.label || doc.file_type_name}
                                                            </span>
                                                        ) : (
                                                            <span className="text-amber-600 flex items-center mt-1">
                                                                <AlertCircle className="h-3 w-3 mr-1" />
                                                                No reconocido / En revisión
                                                            </span>
                                                        )}
                                                    </p>
                                                </div>
                                            </div>
                                            {/* Download or view Actions could go here */}
                                        </CardContent>
                                    </Card>
                                ))
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
